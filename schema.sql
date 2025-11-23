-- Users table
create table users (
  id uuid references auth.users not null primary key,
  email text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Alerts table
create table alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade not null,
  origin_code text not null, -- IATA code (e.g., JFK)
  destination_code text not null, -- IATA code (e.g., LHR)
  trip_type text not null check (trip_type in ('one-way', 'round-trip')),
  target_price numeric not null,
  currency text not null default 'USD',
  start_date_range date not null, -- Start of the date range user is willing to fly
  end_date_range date not null, -- End of the date range user is willing to fly
  cabin_class text check (cabin_class in ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST')),
  max_stops integer,
  max_duration integer, -- in minutes
  last_checked_at timestamp with time zone,
  last_notified_at timestamp with time zone,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table users enable row level security;
alter table alerts enable row level security;

-- Policies for users
create policy "Users can view their own data" on users
  for select using (auth.uid() = id);

create policy "Users can update their own data" on users
  for update using (auth.uid() = id);

-- Policies for alerts
create policy "Users can view their own alerts" on alerts
  for select using (auth.uid() = user_id);

create policy "Users can insert their own alerts" on alerts
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own alerts" on alerts
  for update using (auth.uid() = user_id);

create policy "Users can delete their own alerts" on alerts
  for delete using (auth.uid() = user_id);
