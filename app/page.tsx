'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Trash2, LogIn } from 'lucide-react'; // Added LogIn icon
import { Alert } from '@/lib/types';

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
  const [email, setEmail] = useState(''); // State for login input
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false); // Loading state for login button

  // App State
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tripType, setTripType] = useState('one-way');
  const [cabinClass, setCabinClass] = useState('ECONOMY');

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
    // 1. Helper: Sync the logged-in user to the public.users table
    const syncUser = async (sessionUser: { id: string; email?: string }) => {
      if (!sessionUser.email) return;

      // "Upsert" = Insert if new, Update if exists (prevents duplicate errors)
      const { error } = await supabase.from('users').upsert(
        {
          id: sessionUser.id,
          email: sessionUser.email,
        },
        { onConflict: 'id' }
      );

      if (error) console.error('Error syncing user:', error);
    };

    async function getUser() {
      // 2. Check active session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // SYNC HAPPENS HERE ON PAGE LOAD
        await syncUser(session.user); 
        setUser(session.user);
        fetchAlerts(session.user.id);
      } else {
        setLoading(false);
      }

      // 3. Listen for auth changes (e.g., logging in)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          // SYNC HAPPENS HERE ON LOGIN
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

  // --- NEW: Login Function ---
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    
    // Uses Magic Link (Email OTP) - easiest for setup
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // This redirects them back to this page after clicking the email link
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      }
    });

    if (error) {
      alert('Error logging in: ' + error.message);
    } else {
      alert('Check your email for the login link!');
    }
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setAlerts([]);
  }
  // ---------------------------

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return alert('Please login first');

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
    });

    if (error) {
      alert(error.message);
    } else {
      // Reset form
      setOrigin('');
      setDestination('');
      setTargetPrice('');
      fetchAlerts(user.id);
    }
  }

  async function deleteAlert(id: string) {
    await supabase.from('alerts').delete().eq('id', id);
    setAlerts(alerts.filter(a => a.id !== id));
  }

  // Autocomplete Logic
  const fetchAirports = async (keyword: string, setFn: (data: Suggestion[]) => void) => {
      if(keyword.length < 2) {
          setFn([]);
          return;
      }
      // Note: Ensure you have this API route created or this will fail silently
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

  // --- VIEW 1: NOT LOGGED IN ---
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

  // --- VIEW 2: LOGGED IN (DASHBOARD) ---
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Flight Deal Alerts</h1>
        <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.email}
            </span>
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
                {/* Origin Input */}
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

                {/* Destination Input */}
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

                {/* Other Inputs */}
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
                                    <p>Budget: ${alert.target_price}</p>
                                    <p>Dates: {alert.start_date_range} - {alert.end_date_range}</p>
                                    <p>Cabin: {alert.cabin_class}</p>
                                    <p>Type: {alert.trip_type}</p>
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