import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkFlights } from '@/lib/flight-search';
import { Alert, FlightOffer } from '@/lib/types';

const getSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = getSupabase();

  // Fetch active alerts
  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const alertData of alerts || []) {
    const alert = alertData as Alert;
    const flights = await checkFlights(alert);
    
    if (flights.length > 0) {
      // Prepare data for insertion
      const rowsToInsert = flights.map((flight: FlightOffer) => {
        const airline = flight.validatingAirlineCodes?.[0] || flight.itineraries[0].segments[0].carrierCode;
        return {
            alert_id: alert.id,
            airline_code: airline,
            flight_data: flight, 
            price: parseFloat(flight.price.grandTotal),
            currency: flight.price.currency,
            departure_date: flight.itineraries[0].segments[0].departure.at,
        };
      });

      // Clear old results for this alert to keep data fresh
      await supabase.from('flight_results').delete().eq('alert_id', alert.id);

      // Insert new results
      const { error: insertError } = await supabase
        .from('flight_results')
        .insert(rowsToInsert);

      if (!insertError) {
          await supabase
            .from('alerts')
            .update({ last_checked_at: new Date().toISOString() })
            .eq('id', alert.id);
      }

      results.push({ alertId: alert.id, count: flights.length, saved: true });
    } else {
      results.push({ alertId: alert.id, flightFound: false });
    }
  }

  return NextResponse.json({ results });
}