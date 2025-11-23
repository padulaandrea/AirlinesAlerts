declare module 'amadeus' {
  export default class Amadeus {
    constructor(config: { clientId: string | undefined; clientSecret: string | undefined; hostname?: string });
    shopping: {
      flightOffersSearch: {
        get(params: Record<string, string | number | boolean>): Promise<{ body: string }>;
      };
      flightDates: {
        get(params: Record<string, string | number | boolean>): Promise<{ body: string }>;
      };
    };
    referenceData: {
      locations: {
        get(params: Record<string, string | number | boolean>): Promise<{ body: string }>;
      };
    };
  }
}
