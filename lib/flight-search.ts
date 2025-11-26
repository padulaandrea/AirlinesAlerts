import { amadeus } from './amadeus';
import { Alert, FlightOffer } from './types';
import { addDays, format, parseISO, isValid, isAfter, isBefore } from 'date-fns';

// CONFIGURATION
const BATCH_SIZE = 4; // How many dates to check at the same time
const BATCH_DELAY = 1000; // Milliseconds to wait between batches (to avoid rate limits)
const MAX_RESULTS = 1000; // Maximum number of flights to return

/**
 * Helper to parse ISO 8601 duration format (e.g., "PT2H30M") into total minutes.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  
  return (hours * 60) + minutes;
}

/**
 * Generates a list of all dates between start and end (inclusive).
 */
function getDatesToCheck(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (!isValid(start) || !isValid(end)) return [];
  if (isAfter(start, end)) return [];

  const dates: string[] = [];
  let current = start;

  while (isBefore(current, end) || current.getTime() === end.getTime()) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current = addDays(current, 1);
  }

  return dates;
}

interface AmadeusResponse {
  body: string;
}

/**
 * Checks a SINGLE date for flights.
 * Returns ALL matching offers found for this specific date.
 */
async function searchFlightsForDate(date: string, alert: Alert): Promise<FlightOffer[]> {
  try {
    const searchParams: Record<string, string | number | boolean> = {
      originLocationCode: alert.origin_code,
      destinationLocationCode: alert.destination_code,
      departureDate: date,
      adults: '1',
      currencyCode: alert.currency,
      max: 10, // Request slightly more per day to have options before filtering
      travelClass: alert.cabin_class === 'PREMIUM_ECONOMY' ? 'PREMIUM_ECONOMY' : alert.cabin_class,
      nonStop: alert.max_stops === 0 ? true : false,
      maxPrice: Math.floor(alert.target_price)
    };

    if (alert.trip_type === 'round-trip') {
        const returnDate = addDays(parseISO(date), 7); 
        searchParams.returnDate = format(returnDate, 'yyyy-MM-dd');
    }

    const response = await amadeus.shopping.flightOffersSearch.get(searchParams) as AmadeusResponse;
    if (!response.body) return [];

    const flights: FlightOffer[] = JSON.parse(response.body).data;
    const validFlights: FlightOffer[] = [];

    for (const flight of flights) {
      const price = parseFloat(flight.price.grandTotal);

      // Filter by Max Stops
      if (alert.max_stops !== undefined && alert.max_stops !== null) {
          const outboundSegments = flight.itineraries[0].segments;
          if ((outboundSegments.length - 1) > alert.max_stops) continue;
      }

      // Filter by Duration
      if (alert.max_duration !== undefined && alert.max_duration !== null) {
        const durationMinutes = parseDuration(flight.itineraries[0].duration);
        if (durationMinutes > alert.max_duration) continue;
      }

      // Price Check (Safety check)
      if (price <= alert.target_price) {
        validFlights.push(flight);
      }
    }

    return validFlights;

  } catch (error: unknown) {
    const err = error as { response?: { body: string } };
    console.error(`Error on ${date}:`, err.response ? err.response.body : error);
    return [];
  }
}

/**
 * Main function to process the alert.
 * Returns a list of the top matching flights (up to MAX_RESULTS).
 */
export async function checkFlights(alert: Alert): Promise<FlightOffer[]> {
  console.log(`Checking alert ${alert.id}: ${alert.origin_code} -> ${alert.destination_code}`);

  const allDates = getDatesToCheck(alert.start_date_range, alert.end_date_range);
  if (allDates.length === 0) return [];

  const allFoundFlights: FlightOffer[] = [];

  // --- BATCH PROCESSING LOOP ---
  for (let i = 0; i < allDates.length; i += BATCH_SIZE) {
    const batch = allDates.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch: ${batch.join(', ')}`);

    // Run requests in parallel for this batch
    const results = await Promise.all(
      batch.map(date => searchFlightsForDate(date, alert))
    );

    // Collect all found flights from this batch
    for (const flights of results) {
      allFoundFlights.push(...flights);
    }

    // Wait before next batch to be nice to API rate limits
    if (i + BATCH_SIZE < allDates.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  // Sort all found flights by price (lowest first)
  allFoundFlights.sort((a, b) => parseFloat(a.price.grandTotal) - parseFloat(b.price.grandTotal));

  // Return only the top matches
  return allFoundFlights.slice(0, MAX_RESULTS);
}