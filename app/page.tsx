'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Trash2, Plane } from 'lucide-react';
import { Alert } from '@/lib/types';
import Link from 'next/link';

type Suggestion = {
  label: string;
  value: string;
};

export default function Dashboard() {
  // 1. Initialize Supabase
  const [supabase] = useState(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  // 2. User & Auth State
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  // App State
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tripType, setTripType] = useState('one-way');
  const [cabinClass, setCabinClass] = useState('ECONOMY');
  
  // New State for Filters
  const [maxStops, setMaxStops] = useState('');
  const [maxDuration, setMaxDuration] = useState(''); // In Hours

  // Autocomplete State
  const [originSuggestions, setOriginSuggestions] = useState<Suggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<Suggestion[]>([]);

  const fetchAlerts = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (data) setAlerts(data as Alert[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const syncUser = async (sessionUser: { id: string; email?: string }) => {
      if (!sessionUser.email) return;
      const { error } = await supabase.from('users').upsert(
        { id: sessionUser.id, email: sessionUser.email },
        { onConflict: 'id' }
      );
      if (error) console.error('Error syncing user:', error);
    };

    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await syncUser(session.user); 
        setUser(session.user);
        fetchAlerts(session.user.id);
      } else {
        setLoading(false);
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          await syncUser(session.user);
          setUser(session.user);
          fetchAlerts(session.user.id);
        } else {
          setUser(null);
          setAlerts([]);
        }
      });

      return () => subscription.unsubscribe();
    }
    getUser();
  }, [fetchAlerts, supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      }
    });
    if (error) alert('Error logging in: ' + error.message);
    else alert('Check your email for the login link!');
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setAlerts([]);
  }

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return alert('Please login first');

    // Convert maxDuration from hours to minutes for storage
    const durationInMinutes = maxDuration ? parseInt(maxDuration) * 60 : null;

    const { error } = await supabase.from('alerts').insert({
      user_id: user.id,
      origin_code: origin,
      destination_code: destination,
      trip_type: tripType,
      target_price: parseFloat(targetPrice),
      start_date_range: startDate,
      end_date_range: endDate,
      cabin_class: cabinClass,
      currency: 'USD',
      max_stops: maxStops === '' ? null : parseInt(maxStops),
      max_duration: durationInMinutes,
    });

    if (error) {
      alert(error.message);
    } else {
      // Reset form
      setOrigin('');
      setDestination('');
      setTargetPrice('');
      setMaxStops('');
      setMaxDuration('');
      fetchAlerts(user.id);
    }
  }

  async function deleteAlert(id: string) {
    await supabase.from('alerts').delete().eq('id', id);
    setAlerts(alerts.filter(a => a.id !== id));
  }

  const fetchAirports = async (keyword: string, setFn: (data: Suggestion[]) => void) => {
      if(keyword.length < 2) {
          setFn([]);
          return;
      }
      try {
        const res = await fetch(`/api/airports?keyword=${keyword}`);
        if (res.ok) {
            const data = await res.json();
            setFn(data.data || []);
        }
      } catch (err) {
        console.error("Autocomplete error", err);
      }
  };

  const handleOriginChange = (val: string) => {
      setOrigin(val);
      if (val.length > 1) setTimeout(() => fetchAirports(val, setOriginSuggestions), 300);
  };

  const handleDestinationChange = (val: string) => {
      setDestination(val);
      if (val.length > 1) setTimeout(() => fetchAirports(val, setDestinationSuggestions), 300);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Enter your email to sign in or sign up.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input 
                type="email" 
                placeholder="your@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading ? 'Sending Link...' : 'Send Magic Link'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold">Flight Deal Alerts</h1>
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.email}
            </span>
            
            {/* Link to Results Page */}
            <Link href="/results">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plane className="mr-2 h-4 w-4" />
                View Matches
              </Button>
            </Link>

            <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Create Alert</CardTitle>
              <CardDescription>Get notified when prices drop.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={createAlert} className="space-y-4">
                <div>
                    <label className="text-sm font-medium">Origin (IATA)</label>
                    <Input
                        value={origin}
                        onChange={e => handleOriginChange(e.target.value)}
                        placeholder="e.g. JFK"
                        required
                        maxLength={3} 
                        list="origin-suggestions"
                    />
                    <datalist id="origin-suggestions">
                        {originSuggestions.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </datalist>
                </div>

                <div>
                    <label className="text-sm font-medium">Destination (IATA)</label>
                    <Input
                        value={destination}
                        onChange={e => handleDestinationChange(e.target.value)}
                        placeholder="e.g. LHR"
                        required
                        maxLength={3}
                        list="dest-suggestions"
                    />
                    <datalist id="dest-suggestions">
                        {destinationSuggestions.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </datalist>
                </div>

                 <div>
                    <label className="text-sm font-medium">Target Price (USD)</label>
                    <Input
                        type="number"
                        value={targetPrice}
                        onChange={e => setTargetPrice(e.target.value)}
                        placeholder="500"
                        required
                    />
                </div>
                 <div>
                    <label className="text-sm font-medium">Start Date Range</label>
                    <Input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        required
                    />
                </div>
                 <div>
                    <label className="text-sm font-medium">End Date Range</label>
                    <Input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        required
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-sm font-medium">Max Stops</label>
                        <Input
                            type="number"
                            value={maxStops}
                            onChange={e => setMaxStops(e.target.value)}
                            placeholder="Any"
                            min="0"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Max Hours</label>
                        <Input
                            type="number"
                            value={maxDuration}
                            onChange={e => setMaxDuration(e.target.value)}
                            placeholder="Any"
                            min="1"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-sm font-medium">Trip Type</label>
                    <select
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={tripType}
                        onChange={e => setTripType(e.target.value)}
                    >
                        <option value="one-way">One Way</option>
                        <option value="round-trip">Round Trip</option>
                    </select>
                </div>
                 <div>
                    <label className="text-sm font-medium">Cabin Class</label>
                    <select
                         className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={cabinClass}
                        onChange={e => setCabinClass(e.target.value)}
                    >
                        <option value="ECONOMY">Economy</option>
                        <option value="PREMIUM_ECONOMY">Premium Economy</option>
                        <option value="BUSINESS">Business</option>
                        <option value="FIRST">First</option>
                    </select>
                </div>
                <Button type="submit" className="w-full">Create Alert</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Your Alerts</h2>
            {loading ? <p>Loading...</p> : (
                <div className="grid gap-4">
                    {alerts.length === 0 && <p className="text-muted-foreground">No alerts active.</p>}
                    {alerts.map(alert => (
                        <Card key={alert.id}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-lg">
                                    {alert.origin_code} ✈️ {alert.destination_code}
                                </CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => deleteAlert(alert.id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    <p><span className="font-semibold">Budget:</span> ${alert.target_price}</p>
                                    <p><span className="font-semibold">Dates:</span> {alert.start_date_range} - {alert.end_date_range}</p>
                                    <p><span className="font-semibold">Cabin:</span> {alert.cabin_class}</p>
                                    <p><span className="font-semibold">Type:</span> {alert.trip_type}</p>
                                    {alert.max_stops !== null && (
                                        <p><span className="font-semibold">Max Stops:</span> {alert.max_stops}</p>
                                    )}
                                    {alert.max_duration && (
                                        <p><span className="font-semibold">Max Duration:</span> {Math.round(alert.max_duration / 60)}h</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}