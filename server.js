const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const port = process.env.PORT || 8080;

const MONGODB_URI = process.env.MONGODB_URI_SAMPLE;
const DATABASE_NAME = process.env.MONGODB_DB_NAME || "sample_restaurants";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME || "cohorts";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

// Change this constant later if you want a different fixed cuisine filter.
const STATIC_CUISINE_QUERY = "American";
const SEARCH_RADIUS_KM = 1000;
const MAX_RESULTS = 25;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const client = new MongoClient(MONGODB_URI);
let restaurantsCollection;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config", (req, res) => {
  res.json({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    staticCuisineQuery: STATIC_CUISINE_QUERY,
    searchRadiusKm: SEARCH_RADIUS_KM
  });
});

app.post("/api/restaurants", async (req, res) => {
  try {
    const { age, gender, countryOfOrigin, currentLocation } = req.body || {};
    const latitude = Number(currentLocation?.latitude);
    const longitude = Number(currentLocation?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "A valid current location is required." });
    }

    const pipeline = buildRestaurantPipeline({
      latitude,
      longitude,
      age,
      gender,
      countryOfOrigin
    });

    const results = await restaurantsCollection.aggregate(pipeline).toArray();

    res.json({
      criteria: {
        age: age ?? null,
        gender: gender ?? null,
        countryOfOrigin: countryOfOrigin ?? null,
        currentLocation: { latitude, longitude },
        staticCuisineQuery: STATIC_CUISINE_QUERY,
        searchRadiusKm: SEARCH_RADIUS_KM
      },
      results
    });
  } catch (error) {
    console.error("Search failed", error);
    res.status(500).json({ error: "Restaurant search failed." });
  }
});

function buildRestaurantPipeline({ latitude, longitude, age, gender, countryOfOrigin, cuisine = STATIC_CUISINE_QUERY }) {
  return [
    {
        '$vectorSearch': {
        'index': 'autoembed_customerCohort', 
        'query': `I am a ${age} year old ${gender} from ${countryOfOrigin} who likes ${cuisine} food`, 
        'path': 'text', 
        'numCandidates': 100, 
        'limit': 1
        }
    }, {
        '$lookup': {
        'from': 'restaurant_bookings', 
        'let': {
            'minAge': '$age.min', 
            'maxAge': '$age.max', 
            'countries': '$countries', 
            'gender': '$gender'
        }, 
        'pipeline': [
            {
            '$match': {
                '$expr': {
                '$and': [
                    {
                    '$eq': [
                        '$customer.gender', '$$gender'
                    ]
                    }, {
                    '$gte': [
                        '$customer.age', '$$minAge'
                    ]
                    }, {
                    '$lte': [
                        '$customer.age', '$$maxAge'
                    ]
                    }
                ] 
                }, 
                'restaurant_ref.address_coordinates': {
                '$geoWithin': {
                    '$center': [
                    [
                        longitude, latitude
                    ], 10/6000
                    ]
                }
                }
            }
            }, {
            '$limit': 50
            }
        ], 
        'as': 'result'
        }
    }, {
        '$unwind': {
        'path': '$result'
        }
    }, {
        '$replaceRoot': {
        'newRoot': '$result'
        }
    }, {
        '$lookup': {
        'from': 'restaurants', 
        'localField': 'restaurant_ref.restaurant_object_id', 
        'foreignField': '_id', 
        'as': 'restaurant'
        }
    }, {
        '$set': {
        'restaurant': {
            '$arrayElemAt': [
            '$restaurant', 0
            ]
        }
        }
    }, {
        '$project': {
        'customer': 1, 
        'restaurant': 1
        }
    }
    ];
}

async function start() {
  await client.connect();
  restaurantsCollection = client.db(DATABASE_NAME).collection(COLLECTION_NAME);

  app.listen(port, "0.0.0.0", () => {
    console.log(`Restaurant demo listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error("Application failed to start", error);
  process.exit(1);
});