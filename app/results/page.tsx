'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, StoredFlightResult } from '@/lib/types';
import { format, parseISO, isAfter } from 'date-fns';
import { Plane, ArrowRight, Calendar, Lock, AlertCircle, Ticket, Split } from 'lucide-react';

// Type for the Matching Logic (User Provided Structure)
type MatchedTrip = {
  homeAirport: string;
  airline: string;
  outboundAlert: Alert;
  inboundAlert: Alert;
  outboundFlights: StoredFlightResult[];
  inboundFlights: StoredFlightResult[];
};

// Type for One-Way grouping
type OneWayGroup = {
  airline: string;
  alert: Alert;
  flights: StoredFlightResult[];
};

export default function ResultsPage() {
  const [supabase] = useState(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  const [loading, setLoading] = useState(true);
  
  const [matches, setMatches] = useState<MatchedTrip[]>([]);
  const [oneWayGroups, setOneWayGroups] = useState<OneWayGroup[]>([]);
  
  const [selections, setSelections] = useState<Record<string, { outId: string; inId: string }>>({});

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch Alerts
      const { data: alertsData } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id);
      const alerts = (alertsData || []) as Alert[];

      // 2. Fetch Flight Results
      const { data: resultsData } = await supabase
        .from('flight_results')
        .select('*')
        .in('alert_id', alerts.map(a => a.id))
        .order('departure_date', { ascending: true });
      
      const allResults = (resultsData || []) as StoredFlightResult[];

      // --- SEPARATE DATA ---
      const roundTripResults = allResults.filter(r => r.flight_data.oneWay === false || r.flight_data.oneWay === undefined);
    //   console.log(roundTripResults)
      const oneWayResults = allResults.filter(r => r.flight_data.oneWay === true);

      // --- LOGIC 1: ONE WAY === TRUE (Display Separately) ---
      // Don't look for a round trip. Just group by Airline/Alert.
      const newOneWayGroups: OneWayGroup[] = [];
      
      alerts.forEach(alert => {
        const airlineGroups = new Set(oneWayResults.filter(r => r.alert_id === alert.id).map(r => r.airline_code));
        
        airlineGroups.forEach(airline => {
            const flights = oneWayResults.filter(r => r.alert_id === alert.id && r.airline_code === airline);
            if (flights.length > 0) {
                newOneWayGroups.push({
                    airline,
                    alert,
                    flights
                });
            }
        });
      });

      // --- LOGIC 2: ONE WAY === FALSE (Follow Matching Logic) ---
      // We apply the matching logic specifically to round-trip tickets as requested.
      const newMatches: MatchedTrip[] = [];

      for (let i = 0; i < alerts.length; i++) {
        for (let j = 0; j < alerts.length; j++) {
          if (i === j) continue;
          
          const outbound = alerts[i];
          const inbound = alerts[j];

          // Matching Logic: Outbound Origin == Inbound Destination
          if (outbound.origin_code === inbound.destination_code && outbound.destination_code === inbound.origin_code) {
            const home = outbound.origin_code;
            
            // Use ROUND TRIP results for this matching logic
            const outResults = roundTripResults.filter(r => r.alert_id === outbound.id);
            const inResults = roundTripResults.filter(r => r.alert_id === inbound.id);

            const outAirlines = new Set(outResults.map(r => r.airline_code));
            const inAirlines = new Set(inResults.map(r => r.airline_code));
            const commonAirlines = [...outAirlines].filter(x => inAirlines.has(x));

            commonAirlines.forEach(airline => {
                // Avoid duplicates
                const exists = newMatches.some(m => m.outboundAlert.id === outbound.id && m.airline === airline);
                if (!exists) {
                    newMatches.push({
                        homeAirport: home,
                        airline: airline,
                        outboundAlert: outbound,
                        inboundAlert: inbound,
                        outboundFlights: outResults.filter(r => r.airline_code === airline),
                        inboundFlights: inResults.filter(r => r.airline_code === airline)
                    });
                }
            });
          }
        }
      }

      setMatches(newMatches);
      setOneWayGroups(newOneWayGroups);
      setLoading(false);
    }
    fetchData();
  }, [supabase]);

  const selectOutbound = (matchIndex: number, flightId: string) => {
    setSelections(prev => ({ ...prev, [matchIndex]: { outId: flightId, inId: '' } }));
  };

  const selectInbound = (matchIndex: number, flightId: string) => {
    setSelections(prev => ({ ...prev, [matchIndex]: { ...prev[matchIndex], inId: flightId } }));
  };

  if (loading) return <div className="p-12 text-center text-lg text-slate-500">Searching flights...</div>;

  if (matches.length === 0 && oneWayGroups.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
            <AlertCircle className="h-12 w-12 text-slate-300" />
            <h2 className="text-xl font-semibold text-slate-700">No Flights Found</h2>
            <p className="text-slate-500">Try creating different alerts to see results here.</p>
        </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-12">
      
      {/* SECTION 1: ONE WAY FLIGHTS (oneWay === true) */}
      {oneWayGroups.length > 0 && (
        <div className="space-y-6">
            <div className="flex items-center gap-3 border-b pb-2">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
                    <ArrowRight className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">One-Way Flights</h2>
                    <p className="text-sm text-slate-500">Purchasable immediately without a return flight</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {oneWayGroups.map((group, idx) => (
                    <Card key={`ow-${idx}`} className="border shadow-sm">
                        <CardHeader className="bg-slate-50 border-b py-3">
                            <CardTitle className="flex justify-between items-center text-base">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">{group.airline}</span>
                                    <span className="text-slate-400">|</span>
                                    <span>{group.alert.origin_code} <ArrowRight className="inline h-3 w-3" /> {group.alert.destination_code}</span>
                                </div>
                                <div className="text-sm font-medium text-slate-500">{group.flights.length} options</div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 max-h-[300px] overflow-y-auto">
                            <div className="divide-y">
                                {group.flights.map(flight => (
                                    <div key={flight.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                                        <div>
                                            <div className="font-semibold text-lg text-slate-900">
                                                {format(parseISO(flight.departure_date), 'MMM dd, HH:mm')}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {flight.flight_data.itineraries[0].segments.length > 1 ? 'Stopover' : 'Direct'} • 
                                                {flight.flight_data.itineraries[0].duration.replace('PT', ' ').toLowerCase()}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-blue-700 text-xl">${flight.price}</div>
                                            <div className="text-xs text-slate-400">One Way</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
      )}

      {/* SECTION 2: MATCHED TRIPS (oneWay === false) */}
      {matches.length > 0 && (
        <div className="space-y-6">
            <div className="flex items-center gap-3 border-b pb-2">
                <div className="p-2 bg-purple-100 rounded-lg text-purple-700">
                    <Split className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Round-Trip Combinations</h2>
                    <p className="text-sm text-slate-500">Matched from reciprocal alerts</p>
                </div>
            </div>

            {matches.map((match, idx) => {
                const selection = selections[idx] || { outId: '', inId: '' };
                const selectedOut = match.outboundFlights.find(f => f.id === selection.outId);
                const selectedIn = match.inboundFlights.find(f => f.id === selection.inId);
                
                const visibleInbound = match.inboundFlights.filter(f => {
                    if (!selectedOut) return false;
                    return isAfter(parseISO(f.departure_date), parseISO(selectedOut.departure_date));
                });

                const total = (selectedOut?.price || 0) + (selectedIn?.price || 0);

                return (
                <Card key={`match-${idx}`} className="border-2 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/80 border-b pb-4">
                    <CardTitle className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-white border text-purple-600 flex items-center justify-center shadow-sm">
                            <Plane className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="text-xl font-bold text-slate-900">{match.airline}</div>
                            <div className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                                {match.homeAirport} <ArrowRight className="h-3 w-3" /> {match.outboundAlert.destination_code} <ArrowRight className="h-3 w-3" /> {match.homeAirport}
                            </div>
                        </div>
                        </div>
                        <div className="text-right bg-white px-4 py-2 rounded-lg border">
                            <div className="text-2xl font-bold text-slate-900">
                                {total > 0 ? `$${total.toFixed(2)}` : '--'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase">Total</div>
                        </div>
                    </CardTitle>
                    </CardHeader>
                    
                    <CardContent className="p-0">
                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                            {/* Outbound */}
                            <div className="flex flex-col h-[400px]">
                                <div className="p-3 bg-slate-100/50 border-b text-xs font-bold text-slate-500 sticky top-0">
                                    1. Select Outbound
                                </div>
                                <div className="overflow-y-auto p-2 space-y-2 flex-1 bg-white">
                                    {match.outboundFlights.map(flight => (
                                        <div 
                                            key={flight.id}
                                            onClick={() => selectOutbound(idx, flight.id)}
                                            className={`p-3 rounded-md border-2 cursor-pointer ${selection.outId === flight.id ? 'border-purple-600 bg-purple-50' : 'border-slate-100'}`}
                                        >
                                            <div className="flex justify-between">
                                                <span className="font-bold">{format(parseISO(flight.departure_date), 'MMM dd, HH:mm')}</span>
                                                <span className="font-semibold">${flight.price}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Inbound */}
                            <div className="flex flex-col h-[400px] bg-slate-50/30">
                                <div className="p-3 bg-slate-100/50 border-b text-xs font-bold text-slate-500 sticky top-0">
                                    2. Select Return
                                </div>
                                <div className="overflow-y-auto p-2 space-y-2 flex-1 relative">
                                    {!selectedOut ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6">
                                            <Lock className="h-8 w-8 mb-2 opacity-20" />
                                            <span className="text-xs">Select outbound first</span>
                                        </div>
                                    ) : visibleInbound.map(flight => (
                                        <div 
                                            key={flight.id}
                                            onClick={() => selectInbound(idx, flight.id)}
                                            className={`p-3 rounded-md border-2 cursor-pointer bg-white ${selection.inId === flight.id ? 'border-green-600 bg-green-50' : 'border-slate-100'}`}
                                        >
                                            <div className="flex justify-between">
                                                <span className="font-bold">{format(parseISO(flight.departure_date), 'MMM dd, HH:mm')}</span>
                                                <span className="font-semibold">${flight.price}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                );
            })}
        </div>
      )}
    </div>
  );
}