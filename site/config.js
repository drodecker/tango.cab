/**
 * Tango Cab (tango.cab) - Site Configuration
 * Safe for client-side inclusion (public keys and endpoints only).
 */
const TANGO_CONFIG = {
  domain: "tango.cab",
  brandName: "Tango Cab",
  tagline: "Always in service",
  subTaglines: [
    "Vehicles, depots, and local fleets for autonomous mobility.",
    "Physical capital and 24/7 ops for driverless service."
  ],
  legal: {
    parentEntity: "Tango.Cab LLC (Texas)",
    affiliates: [
      { name: "OC.Cab (OC's Tango)", jurisdiction: "California", focus: "Vehicle assets & long term property leases with government ties" },
      { name: "Tango Nevada LLC", jurisdiction: "Nevada", focus: "Las Vegas hub & regional depots" },
      { name: "Tango Florida LLC", jurisdiction: "Florida", focus: "Tampa, Orlando & Miami hubs" },
      { name: "Tango Texas LLC", jurisdiction: "Texas", focus: "Austin, Dallas & Houston hubs" }
    ]
  },
  markets: [
    { name: "Bay Area", status: "Active RoboTaxi Network" },
    { name: "Austin", status: "Active RoboTaxi Network" },
    { name: "Dallas", status: "Active RoboTaxi Network" },
    { name: "Houston", status: "Active RoboTaxi Network" },
    { name: "Tampa", status: "Active RoboTaxi Network" },
    { name: "Orlando", status: "Active RoboTaxi Network" },
    { name: "Miami", status: "Active RoboTaxi Network" },
    { name: "Las Vegas", status: "Coming Soon" },
    { name: "Orange County, CA", status: "Tango investor committed (OC.Cab)" }
  ],
  consultant: {
    name: "ClawdyDa Aye Eye Consulting",
    url: "https://clawdy.rodecker.com"
  },

  // Mapbox Public Token (pk.*)
  mapboxToken: "pk.eyJ1IjoiZHJvZGVja2VyIiwiYSI6ImNtc2IwdWhrODE2NHYyd29kOWJlOGRyNDAifQ.WbkOzCrrYYGq9afmZ9kW4Q",

  // Cloudflare Worker Form Proxy Endpoint
  workerUrl: "",
  submitPath: "/submit",

  // Live NocoDB Base: "OC.CAB Leads" Table IDs
  tables: {
    investors: "mqi90dk7p4nlpf0",
    property_partners: "m2fsritrqpepcc2",
    careers: "mewoa8u9qvjlsvb"
  },

  // Turnstile Cloudflare Bot Protection Sitekey
  turnstileSiteKey: "0x4AAAAAAEErFzm0wFxJKUVr",

  // Baseline Financial Model Constants (Tango-Fleet Base Case: 12-20 vehicles)
  model: {
    fleetSize: 12,
    daysPerMonth: 30.44,
    vehiclePurchaseCost: 30000,
    chargingInfraCost: 35000,
    softwareLicensingCost: 20000,
    whPerMile: 165,
    inductiveLossMultiplier: 1.08,
    kwhRate: 0.13,
    deadheadMultiplier: 1.30,
    maintPerMile: 0.015,
    insuranceMonthly: 600,
    cleaningMonthly: 290,
    depotShareMonthly: 140,
    softwareMonthly: 70,
    residualValueRatio: 0.30,
    depreciationYears: 5,
    utilizationRamp: [0.5, 0.7, 0.9]
  }
};

const OCCAB_CONFIG = TANGO_CONFIG;
