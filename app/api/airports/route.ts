import { NextRequest, NextResponse } from 'next/server';
import { amadeus } from '@/lib/amadeus';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword');

  if (!keyword || keyword.length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    const response = await amadeus.referenceData.locations.get({
      keyword,
      subType: 'AIRPORT,CITY',
      view: 'LIGHT', // Simplified response
    });

    // Transform to simple format
    const data = JSON.parse(response.body).data;
    const results = data.map((loc: { name: string; iataCode: string }) => ({
      label: `${loc.name} (${loc.iataCode})`,
      value: loc.iataCode,
    }));

    return NextResponse.json({ data: results });
  } catch (error: unknown) {
    console.error('Amadeus Airport Search Error:', error);
    // Return empty if fails, or mock data if dev
    return NextResponse.json({ data: [] });
  }
}
