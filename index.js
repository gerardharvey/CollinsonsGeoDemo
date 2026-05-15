const { MongoClient } = require("mongodb");

const DATABASE_NAME = "sample_restaurants";
const SOURCE_COLLECTION = "restaurants";
const TARGET_COLLECTION = "restaurant_bookings";

const MIN_BOOKINGS_PER_RESTAURANT = 10;
const MAX_BOOKINGS_PER_RESTAURANT = 30;
const MIN_PARTY_SIZE = 1;
const MAX_PARTY_SIZE = 8;
const MAX_DAYS_AHEAD = 90;

const FEMALE_FIRST_NAMES = [
  "Olivia", "Emma", "Sophia", "Amelia", "Ava",
  "Mia", "Isla", "Grace", "Lily", "Chloe"
];

const MALE_FIRST_NAMES = [
  "Noah", "Liam", "Oliver", "Elijah", "James",
  "Lucas", "Henry", "Jack", "Leo", "Theo"
];

const NEUTRAL_FIRST_NAMES = [
  "Alex", "Sam", "Jordan", "Taylor", "Casey",
  "Jamie", "Morgan", "Avery", "Riley", "Quinn"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Brown", "Taylor", "Wilson",
  "Davies", "Thomas", "White", "Martin", "Clark"
];

const COUNTRIES = [
  "United Kingdom", "Ireland", "France", "Germany", "Spain",
  "Italy", "Netherlands", "Portugal", "Sweden", "Canada",
  "United States", "Australia"
];

const GENDERS = ["Female", "Male", "Non-binary"];

const EMAIL_DOMAINS = [
  "example.com",
  "mail.com",
  "demo.net",
  "fakemail.org"
];

const CARD_BRANDS = [
  "Visa",
  "Mastercard",
  "American Express",
  "Discover"
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(values) {
  return values[randomInt(0, values.length - 1)];
}

function randomBookingDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + randomInt(0, MAX_DAYS_AHEAD));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function randomBookingTime() {
  const hour = randomInt(11, 21);
  const minute = randomChoice([0, 15, 30, 45]);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildEmail(firstName, lastName) {
  const suffix = randomInt(100, 999);
  return `${firstName}.${lastName}${suffix}`.toLowerCase() + `@${randomChoice(EMAIL_DOMAINS)}`;
}

function randomPerson() {
  const gender = randomChoice(GENDERS);

  let firstName;
  if (gender === "Female") firstName = randomChoice(FEMALE_FIRST_NAMES);
  else if (gender === "Male") firstName = randomChoice(MALE_FIRST_NAMES);
  else firstName = randomChoice(NEUTRAL_FIRST_NAMES);

  const lastName = randomChoice(LAST_NAMES);

  return {
    name: `${firstName} ${lastName}`,
    email: buildEmail(firstName, lastName),
    age: randomInt(18, 80),
    gender,
    country: randomChoice(COUNTRIES)
  };
}

function calculateDeposit(partySize) {
  const perPerson = randomInt(8, 25);
  return Number((perPerson * partySize).toFixed(2));
}

function extractCoordinates(restaurant) {
  return restaurant?.address?.coord ?? [];
}

function createBookingDocument(restaurant) {
  const partySize = randomInt(MIN_PARTY_SIZE, MAX_PARTY_SIZE);
  const customer = randomPerson();

  return {
    booking_time: randomBookingTime(),
    booking_date: randomBookingDate(),
    party_size: partySize,
    restaurant_ref: {
      restaurant_object_id: restaurant._id,
      restaurant_id: restaurant.restaurant_id,
      address_coordinates: extractCoordinates(restaurant)
    },
    customer,
    credit_card_brand: randomChoice(CARD_BRANDS),
    deposit_taken: calculateDeposit(partySize),
    created_at: new Date()
  };
}

async function main() {
  const uri = process.env.MONGODB_URI_SAMPLE || process.env.CONNECTION_STRING;

  if (!uri) {
    throw new Error("Set MONGODB_URI (or CONNECTION_STRING) before running this script.");
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db(DATABASE_NAME);
    const restaurants = db.collection(SOURCE_COLLECTION);
    const bookings = db.collection(TARGET_COLLECTION);

    let restaurantCount = 0;
    let totalBookingsInserted = 0;

    const cursor = restaurants.find({});

    for await (const restaurant of cursor) {
      const bookingCount = randomInt(
        MIN_BOOKINGS_PER_RESTAURANT,
        MAX_BOOKINGS_PER_RESTAURANT
      );

      const docs = Array.from(
        { length: bookingCount },
        () => createBookingDocument(restaurant)
      );

      const result = await bookings.insertMany(docs, { ordered: true });
      totalBookingsInserted += result.insertedCount;
      restaurantCount += 1;

      if (restaurantCount % 100 === 0) {
        console.log(
          `Processed ${restaurantCount} restaurants, inserted ${totalBookingsInserted} bookings so far.`
        );
      }
    }

    console.log(
      `Done. Processed ${restaurantCount} restaurants and inserted ${totalBookingsInserted} bookings into ${DATABASE_NAME}.${TARGET_COLLECTION}.`
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Booking generation failed:", err);
  process.exit(1);
});