import { amadeus } from './amadeus';
import { Alert, FlightOffer } from './types';
import { addDays, format, differenceInDays, isBefore, parseISO, isValid } from 'date-fns';

/**
 * Helper to generate a list of dates between start and end.
 * Caps at a certain number to avoid rate limits if the range is too huge.
 * Randomizes the start date or selection to ensure coverage over multiple runs.
 */
function getDatesToCheck(startDate: string, endDate: string, maxDates: number = 5): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (!isValid(start) || !isValid(end)) return [];

  const daysDiff = differenceInDays(end, start);

  if (daysDiff <= 0) return [startDate];

  // If the range is small enough, return all dates
  if (daysDiff < maxDates) {
    const dates: string[] = [];
    let current = start;
    while (isBefore(current, end) || current.getTime() === end.getTime()) {
      dates.push(format(current, 'yyyy-MM-dd'));
      current = addDays(current, 1);
    }
    return dates;
  }

  // If range is large, pick 'maxDates' random dates within the range
  // This ensures that over multiple cron runs, we likely cover different days.
  const dates: Set<string> = new Set();
  while (dates.size < maxDates) {
    const randomOffset = Math.floor(Math.random() * (daysDiff + 1));
    const date = addDays(start, randomOffset);
    dates.add(format(date, 'yyyy-MM-dd'));
  }

  return Array.from(dates).sort();
}

// Define basic interface for Amadeus response to avoid 'any'
interface AmadeusResponse {
  body: string;
}

/**
 * Searches for flights matching the alert criteria.
 * Filters results strictly by the user's target_price.
 * Returns the cheapest flight object if found.
 */
export async function checkFlights(alert: Alert): Promise<FlightOffer | null> {
  console.log(`Checking flights for alert ${alert.id}: ${alert.origin_code} to ${alert.destination_code}`);

  // Determine dates to check
  // Limit to checking 3 dates per run to be safer on rate limits since we might have many alerts
  const datesToCheck = getDatesToCheck(alert.start_date_range, alert.end_date_range, 3);
 console.log(datesToCheck)
  if (datesToCheck.length === 0) {
    console.log('No dates to check for this alert.');
    return null;
  }

  let cheapestFlight: FlightOffer | null = null;
  let minPrice = Infinity;

  for (const date of datesToCheck) {
    try {
      console.log(date);
      // Add a small delay between requests to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 500));

      const searchParams: Record<string, string | number | boolean> = {
        originLocationCode: alert.origin_code,
        destinationLocationCode: alert.destination_code,
        departureDate: date,
        adults: '1',
        currencyCode: alert.currency,
        max: 5, // We only need the top cheapest
        travelClass: alert.cabin_class === 'PREMIUM_ECONOMY' ? 'PREMIUM_ECONOMY' : alert.cabin_class,
        nonStop: alert.max_stops === 0 ? true : false,
      };

      // Handle Round Trip
      // For MVP, if round-trip, we assume a default trip duration of 7 days if not specified.
      // Ideally schema should have 'trip_duration_days'.
      if (alert.trip_type === 'round-trip') {
         const returnDate = addDays(parseISO(date), 7); // Default 7 days
         searchParams.returnDate = format(returnDate, 'yyyy-MM-dd');
      }

      const response = await amadeus.shopping.flightOffersSearch.get(searchParams) as AmadeusResponse;

      if (!response.body) continue;
      // console.log(response.body)
      const flights: FlightOffer[] = JSON.parse(response.body).data;

      for (const flight of flights) {
        const price = parseFloat(flight.price.grandTotal);

        // Filter by Max Stops if set
        if (alert.max_stops !== undefined && alert.max_stops !== null) {
            // Check segments in the first itinerary (outbound)
            const outboundSegments = flight.itineraries[0].segments;
            const stops = outboundSegments.length - 1;

            // If round trip, check return too? usually max stops applies to each leg or total?
            // Usually per leg.
            if (stops > alert.max_stops) continue;

            if (flight.itineraries[1]) {
                const inboundSegments = flight.itineraries[1].segments;
                const inboundStops = inboundSegments.length - 1;
                if (inboundStops > alert.max_stops) continue;
            }
        }

        if (price <= alert.target_price) {
          if (price < minPrice) {
            minPrice = price;
            cheapestFlight = flight;
          }
        }
      }

    } catch (error: unknown) {
      // Cast error to any to access properties safely or use type guard
      const err = error as { response?: { body: string } };
      console.error(`Error checking date ${date} for alert ${alert.id}:`, err.response ? err.response.body : error);
      // Continue to next date
    }
  }

  return cheapestFlight;
}
