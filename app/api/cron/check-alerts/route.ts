import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkFlights } from '@/lib/flight-search';
import { Resend } from 'resend';
import { Alert } from '@/lib/types';
import { differenceInHours, parseISO } from 'date-fns';

// Initialize lazily
const getSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!
    );
};

// const getResend = () => {
//     return new Resend(process.env.RESEND_API_KEY);
// };

interface AlertWithUser extends Alert {
  users: {
    email: string;
  } | null; 
}

export async function GET(req: NextRequest) {
  // Verify Cron Secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = getSupabase();
  // const resend = getResend();

  // Fetch active alerts and join with users to get email
  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*, users!alerts_user_id_fkey(email)')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  console.log(`Processing ${alerts?.length} alerts...`);

  for (const alertData of alerts || []) {
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

    const userEmail = Array.isArray(alert.users) ? alert.users[0]?.email : alert.users?.email;

    if (!userEmail) {
        console.error(`No email found for user ${alert.user_id}`);
        continue;
    }

    // Check for flights (Returns an Array now)
    const flights = await checkFlights(alert);
    console.log("==========")
    console.log(JSON.stringify(flights, null, 2));
    console.log("==========")
    if (flights.length > 0) {
      console.log(`Found ${flights.length} flights for alert ${alert.id}`);
      
      // Get the best flight for the summary
      const bestFlight = flights[0];

      // Generate HTML for the top 5 flights (to avoid huge emails)
      const topFlights = flights.slice(0, 1000);
      const flightsHtml = topFlights.map(f => `
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
            <p style="font-size: 16px; margin: 0;"><strong>${f.price.grandTotal} ${f.price.currency}</strong></p>
            <p style="margin: 5px 0;">Departure: ${f.itineraries[0].segments[0].departure.at.replace('T', ' ')}</p>
            <p style="margin: 5px 0;">Carrier: ${f.itineraries[0].segments[0].carrierCode}</p>
            <p style="margin: 5px 0;">is one way: ${f.oneWay}</p>
            <p style="margin: 5px 0; font-size: 12px; color: #666;">Duration: ${f.itineraries[0].duration}</p>

        </div>
      `).join('');

      const emailHtml = `
        <h2>We found ${flights.length} deals for ${alert.origin_code} to ${alert.destination_code}!</h2>
        <p>Your budget: ${alert.target_price} ${alert.currency}</p>
        <hr/>
        ${flightsHtml}
        <p><a href="#">Book Now on Amadeus/Airline</a></p>
      `;

      // Log for debugging
      console.log(emailHtml);

      // Uncomment to enable Email Sending
      /*
      const { error: emailError } = await resend.emails.send({
        from: 'Flight Alert <onboarding@resend.dev>',
        to: [userEmail],
        subject: `Flight Deals Found: ${alert.origin_code} to ${alert.destination_code}`,
        html: emailHtml,
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
      */

      results.push({ 
          alertId: alert.id, 
          flightFound: true, 
          count: flights.length,
          bestPrice: bestFlight.price.grandTotal, 
          emailSent: true 
      });
    } else {
      results.push({ alertId: alert.id, flightFound: false });
    }
  }

  return NextResponse.json({ results });
}