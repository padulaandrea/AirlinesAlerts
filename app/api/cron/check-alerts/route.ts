import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkFlights } from '@/lib/flight-search';
import { Resend } from 'resend';
import { Alert } from '@/lib/types';
import { differenceInHours, parseISO } from 'date-fns';

// Initialize lazily or inside handler to avoid build-time errors if env vars missing
const getSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

const getResend = () => {
    return new Resend(process.env.RESEND_API_KEY);
};

interface AlertWithUser extends Alert {
  users: {
    email: string;
  } | null; // Join might return null if user deleted or something, though FK enforces.
}

export async function GET(req: NextRequest) {
  // Verify Cron Secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = getSupabase();
  const resend = getResend();

  // Fetch active alerts and join with users to get email
  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*, users(email)')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const alertData of alerts || []) {
    // Type assertion or manual mapping needed because of the join
    const alert = alertData as unknown as AlertWithUser;

    // Check spam prevention: don't notify if notified in last 24 hours
    if (alert.last_notified_at) {
        const lastNotified = parseISO(alert.last_notified_at);
        const hoursDiff = differenceInHours(new Date(), lastNotified);
        if (hoursDiff < 24) {
            console.log(`Skipping alert ${alert.id}, notified ${hoursDiff} hours ago.`);
            results.push({ alertId: alert.id, status: 'skipped_spam_prevention' });
            continue;
        }
    }

    // Supabase join returns object for single relation or array?
    // It returns object if one-to-one or many-to-one.
    const userEmail = Array.isArray(alert.users) ? alert.users[0]?.email : alert.users?.email;

    if (!userEmail) {
        console.error(`No email found for user ${alert.user_id}`);
        continue;
    }

    // Check for flights
    const flight = await checkFlights(alert);

    if (flight) {
      // Send Email
      const { error: emailError } = await resend.emails.send({
        from: 'Flight Alert <onboarding@resend.dev>',
        to: [userEmail],
        subject: `Flight Deal Found: ${alert.origin_code} to ${alert.destination_code}`,
        html: `<p>Found a flight for <strong>${flight.price.grandTotal} ${flight.price.currency}</strong>!</p>
               <p>Departure: ${flight.itineraries[0].segments[0].departure.at}</p>
               <p>Price Limit: ${alert.target_price}</p>
               <p><a href="#">Book Now on Amadeus/Airline</a></p>`,
      });

      if (emailError) {
        console.error('Email error', emailError);
      } else {
         console.log(`Email sent to ${userEmail} for alert ${alert.id}`);
         // Update last_notified_at
         await supabase
           .from('alerts')
           .update({ last_notified_at: new Date().toISOString() })
           .eq('id', alert.id);
      }

      results.push({ alertId: alert.id, flightFound: true, price: flight.price.grandTotal, emailSent: !emailError });
    } else {
      results.push({ alertId: alert.id, flightFound: false });
    }
  }

  return NextResponse.json({ results });
}
