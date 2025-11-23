import Amadeus from 'amadeus';

// Mock Amadeus if keys are missing to prevent crash during build/dev
const clientId = process.env.AMADEUS_CLIENT_ID || 'MOCK_CLIENT_ID';
const clientSecret = process.env.AMADEUS_CLIENT_SECRET || 'MOCK_CLIENT_SECRET';

export const amadeus = new Amadeus({
  clientId,
  clientSecret,
});
