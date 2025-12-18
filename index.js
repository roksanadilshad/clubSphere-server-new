require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const admin = require('firebase-admin')
const port = process.env.PORT || 3000
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})


const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

/// tracking id generator
const generateTrackingId = () => {
  return `TRX-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

const app = express()
// middleware
app.use(
  cors({
    origin:[ 'https://club-sphere-client-new-62n4.vercel.app',,
      'http://localhost:5173',
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionSuccessStatus: 200,
  })
)


app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  //console.log(token)

  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    //console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

// app.post(
//   "/stripe-webhook",
//   express.raw({ type: "application/json" }),
//   async (req, res) => {
//     const sig = req.headers["stripe-signature"];

//     let event;

//     try {
//       event = stripe.webhooks.constructEvent(
//         req.body,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       console.log("Webhook signature failed", err.message);
//       return res.status(400).send(`Webhook Error`);
//     }

//     if (event.type === "checkout.session.completed") {
//       const session = event.data.object;

//       const membership = {
//         userEmail: session.metadata.userEmail,
//         clubId: session.metadata.clubId,
//         clubName: session.metadata.clubName,
//         status: "active",
//         paymentId: session.payment_intent,
//         joinedAt: new Date(),
//         expiresAt: null,
//       };

//       await membershipsCollection.insertOne(membership);
//     }

//     res.json({ received: true });
//   }
// );


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})


async function run() {
  try {
         const db = client.db('clubspheredb')
         const clubsCollection = db.collection('clubs')
         const eventRegistrationsCollection = db.collection('eventRegistrations')
         const eventsCollection = db.collection('events')
         const membershipsCollection = db.collection('memberships')
         const paymentsCollection = db.collection('payments')
         const usersCollection = db.collection('users')
         const managerApplicationCollection = db.collection("managerApplication")
         const contactCollection = db.collection("contact")
          

         // middle admin before allowing admin activity
        // must be used after verifyFBToken middleware
        const verifyAdmin = async (req, res, next) => {
    // Correctly accessing the email from req.decoded
    const email = req.decoded?.email; 
    
    if (!email) {
        return res.status(401).send({ message: 'Unauthorized: No email in token' });
    }

    const query = { email };
    const user = await usersCollection.findOne(query);

    if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    next();
};
        const verifyManager = async (req, res, next) => {
    const email = req.decoded?.email; // Ensure this is decoded, not tokenEmail
    const user = await usersCollection.findOne({ email });

    // Is it 'manager' or 'Manager'? It must be exactly what is in your DB.
    if (user?.role !== 'manager') { 
        return res.status(403).send({ message: 'Forbidden' });
    }
    next();
};

 app.get("/clubs", async (req, res) => {
  try {
    const {
      limit = 10,       // Default to 10 so it actually returns data
      skip = 0,
      sort = 'membershipFee',
      order = 'desc',
      search = "",
      category = ""     // 1. Added category here
    } = req.query;

    // Build the sort object
    const sortOption = {};
    sortOption[sort] = order === 'asc' ? 1 : -1;

    // 2. Multi-filter Query Logic
    let query = {};

    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    if (category) {
      query.category = category; // 3. This matches your "Popular Categories" clicks
    }

    // Execute database calls
    const clubs = await clubsCollection
      .find(query)
      .sort(sortOption)
      .skip(Number(skip))
      .limit(Number(limit))
      .project({ description: 0, rating: 0 })
      .toArray();

    const total = await clubsCollection.countDocuments(query);

    res.send({ total, clubs });

  } catch (error) {
    console.error("Clubs Fetch Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// featuredClubs
         app.get("/featuredClubs",  async (req, res) => {
           try{
                  const clubs = await clubsCollection
                  .find()
                  .limit(8)
                  .sort({membershipFee: -1})
                  .project({description: 0, rating: 0, status: 0, managerEmail: 0, 
                   createdAt: 0 , updatedAt: 0})
                  .toArray()

                  res.send(clubs);
                }catch(error) {
                   res.status(500).send({message: "Filed to fetch clubs", error});
                }
               })

// clubDetails
              app.get("/clubs/:id",  async (req, res) => {
                      try{
                          const id = req.params.id;

                           if(!ObjectId.isValid(id)){
                    return res.status(400).send({message: "Invalid Club ID"})
                  }

                  const club = await clubsCollection.findOne({_id: new ObjectId(id)})

                  if(!club){
                    return res.status(404).send({message: "Club not found"})
                  }

                  res.send(club)
                }catch(error) {
                   res.status(500).send({message: "Filed to fetch clubs", error});
                }
               })

              //create clubs
              app.post("/clubs", async (req, res) => {
  try {
    const data = req.body;
    data.status = "pending";
    data.createdAt = new Date();
    data.updatedAt = new Date();

    const result = await clubsCollection.insertOne(data);
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

         // user save
         app.post("/users", async (req, res) => {
          const user = req.body;
       // email exist
          const exist = await usersCollection.findOne({email: user.email});
          if(exist){
            return res.send({message: "User already exists", inserted: false});
          }
            user.role = "member";
            user.createdAt = new Date();
            
            const result = await usersCollection.insertOne(user);
            res.send(result);

         })

       // get All user (admin)
       app.get("/users", verifyJWT, verifyAdmin, async (req, res) =>{
        const result = await usersCollection.find().toArray();
        res.send(result)
       });

      app.get('/users/:email/role', async (req, res) => {
    const email = req.params.email;
    if (!email || email === "undefined") {
        return res.status(400).send({ message: "Invalid email parameter" });
    }
    const user = await usersCollection.findOne({ email });
    res.send({ role: user?.role || 'user' });
});
       // get All clubs (admin)
       app.get("/clubs", verifyJWT, async (req, res) =>{
        const result = await clubsCollection.find().toArray();
        res.send(result)
       });
       // get All events (admin)
       app.get("/events", async (req, res) =>{
        const result = await eventsCollection.find().toArray();
        res.send(result)
       });
// status approve of clubs
       app.patch("/clubs/approve/:id", async (req, res) => {
  const id = req.params.id;
  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved", updatedAt: new Date() } }
  );
  res.send(result);
});
// status reject of clubs
       app.patch("/clubs/reject/:id", async (req, res) => {
  const id = req.params.id;
  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "reject", updatedAt: new Date() } }
  );
  res.send(result);
});

       // Get user role by email
        app.get("/users/role/:email", verifyJWT, verifyAdmin, async (req, res) => {
         const email = req.params.email;
         const user = await usersCollection.findOne({ email });
       
         if (!user) return res.status(404).send({ message: "User not found" });

      res.send({ role: user.role });
        });

 //user Update (admin)
         app.patch("/users/role/:email", verifyJWT, verifyAdmin, async (req, res)=>{
          const email = req.params.email;
             const {role} = req.body;
            
         try {
    const result = await usersCollection.updateOne(
      { email: email },
      { $set: { role: role } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update role", error });
  }  
  });

app.get('/users/:email', verifyJWT, async (req, res) => {
  const email = req.params.email;

  try {
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    const response = {
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      role: user.role,             // include role
      createdAt: user.createdAt,   // include createdAt
    };

    res.send(response);

  } catch (error) {
    res.status(500).send({ message: "Server Error", error });
  }
});


//get all clubs
app.get("/admin/clubs", async (req, res) => {
  try {
    const clubs = await clubsCollection.find().toArray();
    res.send(clubs);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

//approve a club
app.patch("/admin/clubs/approve/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;

  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved", updatedAt: new Date() } }
  );

  res.send(result);
});

//reject a club
app.patch("/admin/clubs/reject/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;

  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "rejected", updatedAt: new Date() } }
  );

  res.send(result);
});


// POST /memberships - user joins a club
app.post("/memberships", verifyJWT, async (req, res) => {
  // console.log("🔥 MEMBERSHIP API HIT");
  // console.log("BODY:", req.body);

  
  try {
    const {
      userEmail,
      clubId,        // MongoDB _id
      clubName,      // optional
      status,
      paymentId,
      joinedAt,
      expiresAt,
       membershipFee,
       
    } = req.body;

    // validation
    if (!userEmail || !clubId || !status) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const clubObjectId = new ObjectId(clubId);

    const existing = await membershipsCollection.findOne({
      userEmail,
      clubId: clubObjectId,
      status: { $in: ["active", "pendingPayment"] }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "User already joined this club",
      });
    }

    const newMembership = {
      userEmail,
      clubId: new ObjectId(clubId),                // ✅ always MongoDB _id
      clubName: clubName || null,
      status,                // active | pendingPayment | expired
      paymentId: paymentId || null,
      joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      membershipFee: Number(membershipFee) || 0,
    };
    
    const result = await membershipsCollection.insertOne(newMembership);
console.log("✅ INSERT RESULT:", result);
   
if (status === "active") {
      await clubsCollection.updateOne(
        { _id: clubObjectId },
        { $inc: { memberCount: 1 } }
      );
    }

    res.status(201).json({
      success: true,
      membershipId: result.insertedId,
      data: newMembership
    });

  } catch (err) {
    console.error("Membership creation error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// app.get("/debug/memberships", async (req, res) => {
//   const data = await membershipsCollection.find().toArray();
//   res.send(data);
// });



// Example GET memberships by user
// app.get("/memberships", async (req, res) => {
//   const { userEmail, clubId } = req.query;

//   const membership = await membershipsCollection.findOne({
//     userEmail,
//     clubId
//   });

//   res.send({
//     exists: !!membership,
//     data: membership || null
//   });
// });


app.get("/memberships/check", async (req, res) => {
  const { userEmail, clubId } = req.query; // use clubId everywhere
  const membership = await membershipsCollection.findOne({ userEmail, clubId });
  res.send({ isMember: !!membership });
});


// GET /memberships?userEmail=...
app.get('/memberships',verifyJWT, async (req, res) => {
  const { userEmail } = req.query;
  if (!userEmail) return res.status(400).json({ error: 'User email is required' });

  try {
    const memberships = await membershipsCollection
      .find({ userEmail, status: 'active' }) // only active memberships
      .toArray();

    res.json(memberships);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch memberships' });
  }
});

// Get all members of a specific club
app.get('/memberships/club/:clubId', async (req, res) => {
  const { clubId } = req.params;
  if (!clubId) return res.status(400).json({ error: 'Club ID is required' });

  try {
    const members = await membershipsCollection
      .find({ clubId: clubId, status: 'active' }) // only active members
      .toArray();

    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch club members' });
  }
});


//leave club
 app.delete("/memberships/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
  const result = await membershipsCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) return res.status(404).json({ message: "Not found" });
  res.status(200).json({ message: "Membership removed successfully" });
});


// GET /clubs?managerEmail=manager@example.com
app.get("/clubs", async (req, res) => {
  try {
    const { managerEmail } = req.query;
    const query = managerEmail ? { managerEmail } : {};
    const clubs = await clubsCollection.find(query).toArray();
    res.send(clubs);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// PATCH /clubs/:id
app.patch("/clubs/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    await clubsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Fetch all clubs for a manager
app.get("/manager/clubs", verifyJWT,verifyManager, async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ message: "Email required" });
  const clubs = await clubsCollection.find({ managerEmail: email }).toArray();
  res.json(clubs);
});

// DELETE /clubs/:id
app.delete("/clubs/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid club ID" });
  }

  try {
    const result = await clubsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Club not found" });
    }

    res.status(200).json({ message: "Club deleted successfully" });
  } catch (error) {
    console.error("Error deleting club:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// this might be overriding the working route
// app.get("/clubs/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//      const updatedData = req.body;

//     if (!ObjectId.isValid(id)) {
//       return res.status(400).json({ message: "Invalid Club ID" });
//     }

//     const result = await client
//       .db("clubspheredb")
//       .collection("clubs")
//       .updateOne({ _id: new ObjectId(id) }, { $set: updatedData });

//       if (result.matchedCount === 0) {
//       return res.status(404).json({ message: "Club not found" });
//     }

//     // const club = await client.db("clubspheredb").collection("clubs").findOne({ _id: new ObjectId(id) });

//     // if (!club) {
//     //   return res.status(404).json({ message: "Club not found" });
//     // }

//     res.json({ success: true, updatedData });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server Error" });
//   }
// });

app.get("/clubs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const club = await clubsCollection.findOne({ _id: new ObjectId(id) });

    if (!club) return res.status(404).json({ message: "Club not found" });

    res.json(club);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



//get members of clubs
app.get("/clubs/:clubId/members", verifyJWT, async (req, res) => {
  try {
    const {clubId} = req.params;

    const memberships = await membershipsCollection
      .find({ clubId: decodeURIComponent(clubId)  })
      .toArray();

    // Get all related user data
    const usersEmails = memberships.map(m => m.userEmail);

    const users = await usersCollection
      .find({ email: { $in: usersEmails } })
      .toArray();

    // Merge users + membership info into one object
    const members = memberships.map((membership) => {
      const user = users.find((u) => u.email === membership.userEmail);

      return {
        id: membership._id,
        name: user?.name || "Unknown",
        email: membership.userEmail,
        photoURL: user?.photoURL || null,
        status: membership.status,
        joinedAt: membership.joinedAt,
        expiryDate: membership.expiresAt,
        membershipFee: membership.membershipFee || 0
      };
    });

    res.json(members);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch members" });
  }
});

//expiration
app.patch("/memberships/:id/expire", async (req, res) => {
  try {
    const membershipId = req.params.id;

    const result = await membershipsCollection.updateOne(
      { _id: new ObjectId(membershipId) },
      {
        $set: {
          status: "expired",
          expiresAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: "Failed to update membership" });
    }

    res.json({ message: "Membership expired successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});





// GET /manager/members?managerEmail=...
app.get("/manager/members", verifyJWT, verifyManager, async (req, res) => {
  try {
    const { managerEmail } = req.query;
    if (!managerEmail) return res.status(400).json({ message: "managerEmail required" });

    // Get clubs managed by this manager
    const clubs = await clubsCollection.find({ managerEmail }).toArray();
    //if (!clubs.length) return res.json([]);

    const clubIds = clubs.map(c => c._id.toString()); // keep as ObjectId

    // Get memberships for these clubs
    const memberships = await membershipsCollection
      .find({ clubId: { $in: clubIds } }) // match ObjectId
      .toArray();
console.log(memberships);
    // Optional: Merge user info if available
    const userEmails = memberships.map(m => m.userEmail);
    const users = await usersCollection
      .find({ email: { $in: userEmails } })
      .toArray();

    const members = memberships.map(m => {
      const club = clubs.find(c => c._id.equals(m.clubId));
      const user = users.find(u => u.email === m.userEmail);

      return {
        id: m._id.toString(),
        name: user?.name || m.name || "Unknown",
        email: m.userEmail || m.email || "Unknown",
        photoURL: user?.photoURL || "",
        clubName: club?.clubName || "Unknown",
        status: m.status || "active",
        joinedAt: m.joinedAt || m.createdAt || new Date(),
        expiryDate: m.expiresAt || null,
        membershipFee: m.membershipFee || 200
      };
    });

    res.send(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch members" });
  }
});



// Get all events for a manager's clubs
app.get("/manager/events", verifyJWT, verifyManager, async (req, res) => {
  try {
    const email = req.query.email; // manager email
    if (!email) return res.status(400).json({ message: "Email required" });

    const clubs = await clubsCollection.find({ managerEmail: email }).toArray();
    const clubIds = clubs.map((c) => c._id.toString());

    const events = await eventsCollection.find({ clubId: { $in: clubIds } }).toArray();
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /events
app.post("/events", async (req, res) => {
  try {
    const { title, description, eventDate, location, isPaid, eventFee, maxAttendees, clubId } = req.body;

    if (!title || !description || !eventDate || !location || maxAttendees == null) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const newEvent = {
      title,
      description,
      eventDate: new Date(eventDate),
      location,
      isPaid: Boolean(isPaid),
      eventFee: isPaid ? Number(eventFee) : 0,
      maxAttendees: Number(maxAttendees),
      createdAt: new Date(),
      updatedAt: new Date(),
      clubId
    };

    const result = await eventsCollection.insertOne(newEvent);

    res.status(201).json({ success: true, event: result });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// Update event
app.get("/events/:id", async (req, res) => {
  const { id } = req.params;
  const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
  if (!event) return res.status(404).json({ message: "Event not found" });
  res.json(event);
});

//put
app.put("/events/:id", async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  const result = await eventsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ message: "Event not found" });
  }

  res.json({ success: true });
});


// Delete event
app.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await eventsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Event not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// app.post("/events/:id/register", async (req, res) => {
//   const { eventId, clubId, userEmail } = req.body;

//   if (!eventId || !userEmail || !clubId) {
//     return res.status(400).json({ message: "Missing required data" });
//   }

//   const registration = {
//     eventId,      // store event name
//     clubId,       // store club name
//     userEmail,
//     status: "registered",
//     paymentId: null,
//     registeredAt: new Date(),
//   };

//   try {
//     await eventRegistrationsCollection.insertOne(registration);
//     res.status(201).json({ message: "Registered successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Failed to register" });
//   }
// });


// GET /events
app.post("/events/:eventId/register", verifyJWT, async (req, res) => {
  try {
    const { eventId } = req.params;   // eventId = ObjectId string
    const { userEmail } = req.body;

    if (!userEmail) return res.status(400).json({ error: "userEmail is required" });

    //  Find event by _id
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) return res.status(404).json({ error: "Event not found" });

    //  Check if already registered
    const existingRegistration = await eventRegistrationsCollection.findOne({
      eventId,   // store eventId as string
      userEmail,
    });
    if (existingRegistration) return res.status(400).json({ error: "Already registered" });

    //  Check max attendees
    const count = await eventRegistrationsCollection.countDocuments({ eventId });
    if (event.maxAttendees && count >= event.maxAttendees)
      return res.status(400).json({ error: "Event is full" });

    //  Insert registration
    const registration = {
      eventId: eventId,             // store ObjectId string
      clubId: event.clubId,
      userEmail,
      status: "registered",
      paymentId: null,
      registeredAt: new Date(),
    };

    const result = await eventRegistrationsCollection.insertOne(registration);
     
    res.send(result)
    res.status(201).json({ message: "Registered successfully", registration });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});



app.get("/events", async (req, res) => {
  try {
    const events = await eventsCollection.aggregate([
      {
        $lookup: {
          from: "eventRegistrations",       // collection with registrations
          localField: "_id",                // event _id
          foreignField: "eventId",          // field in registrations pointing to event
          as: "registrationsList",          // new field to hold registrations
        },
      },
      {
        $addFields: { registrations: { $size: "$registrationsList" } },
      },
      {
        $project: { registrationsList: 0 }, // optionally remove detailed list
      },
    ]).toArray();

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/manager/events/:eventId/registrations
app.get("/manager/events/:eventId/register", async (req, res) => {
  const { eventId } = req.params;

  try {
    const registrations = await eventRegistrationsCollection
      .find({ eventId }) // match eventId (could be ObjectId if needed)
      .project({ userEmail: 1, status: 1, registeredAt: 1, _id: 0 }) // only needed fields
      .toArray();

    res.json(registrations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch registrations" });
  }
});

 app.get("/events/:eventId/registrations", async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    // ✅ Get registrations by eventId (string)
    const registrations = await eventRegistrationsCollection
      .find({ eventId }) 
      .toArray();

    // ✅ Get user info
    const userEmails = registrations.map(r => r.userEmail);
    const users = await usersCollection
      .find({ email: { $in: userEmails } })
      .toArray();

    const data = registrations.map(reg => {
      const user = users.find(u => u.email === reg.userEmail);
      return {
        ...reg,
        userName: user?.name || "Anonymous",
        userPhoto: user?.photoURL || null
      };
    });

    res.json(data);
  } catch (err) {
    console.error("Registrations fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// app.get("/manager/events", async (req, res) => {
//   try {
//     const managerEmail = req.user.email; // assuming you have auth middleware
//     const events = await Event.find({ managerEmail }); // fetch events for this manager
//     res.send(events);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Server error" });
//   }
// });

//get event for member
app.get("/member/events", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const registrations = await eventRegistrationsCollection
      .find({ userEmail: email })
      .toArray();

    if (!registrations.length) return res.json([]);

    const eventObjectIds = registrations.map(
      r => new ObjectId(r.eventId)
    );

    const clubObjectIds = registrations.map(
      r => new ObjectId(r.clubId)
    );

    const events = await eventsCollection
      .find({ _id: { $in: eventObjectIds } })
      .toArray();

    const clubs = await clubsCollection
      .find({ _id: { $in: clubObjectIds } })
      .toArray();

    const merged = registrations.map(reg => {
      const event = events.find(
        e => e._id.toString() === reg.eventId
      );

      const club = clubs.find(
        c => c._id.toString() === reg.clubId
      );

      return {
        id: reg._id,
        title: event?.title || "Unknown Event",
        clubName: club?.clubName || "Unknown Club",
        date: event?.eventDate,
        location: event?.location,
        status: reg.status,
        isPaid: !!reg.paymentId,
        eventFee: event?.eventFee ?? 0,
        description: event?.description ?? "",
      };
    });

    res.json(merged);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//manager apply
app.post('/manager/apply', async (req, res) => {
  console.log(req.body);
  
  const {
    email,
    fullName,
    phone,
    occupation,
    organization,
    experience,
    reason,
    preferredCategories,
    idNumber,
    idDocumentUrl,
  } = req.body;

  if (!email || !fullName || !phone || !reason) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const existing = await managerApplicationCollection.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'You have already applied' });
    }

    const application = {
      email,
      fullName,
      phone,
      occupation: occupation || '',
      organization: organization || '',
      experience: experience || '',
      reason,
      preferredCategories: preferredCategories || [],
      idNumber: idNumber || '',
      idDocumentUrl: idDocumentUrl || '',
      status: 'pending',
      appliedAt: new Date()
    };

    const result = await managerApplicationCollection.insertOne(application);
    res.status(201).json({message: 'Application submitted successfully',
            insertedId: result.insertedId});

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error', err });
  }
});

//get manager
app.get('/manager/application/me', async (req, res) => {
  const email = req.query.email; // pass user email as query param
  if (!email) return res.status(400).json({ message: 'Email required' });

  try {
    const application = await managerApplicationCollection.findOne({ email });
    if (!application) return res.status(404).json({ message: 'No application found' });
    res.json(application);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

//get application by admin
app.get('/admin/manager-applications', verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const applications = await managerApplicationCollection.find({status: 'pending'}).toArray();
    res.send(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

//admin status change
// Server-side logic to handle 'reject_app'

app.patch("/managers/role/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { role } = req.body;

    // ✅ Updated allowed roles
    const allowedRoles = ["clubManager", "member"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: `Invalid role provided. Must be one of: ${allowedRoles.join(", ")}.`,
      });
    }

    const result = await usersCollection.updateOne(
      { email },
      { $set: { role } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "User not found or role unchanged" });
    }

    res.json({ message: `Role updated to ${role} successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update role" });
  }
});


// --- Server Side (Your Express/Node.js file) ---

app.delete('/admin/manager-applications/:id', verifyJWT, verifyAdmin, async (req, res) => {
    const id = req.params.id;

    if (!id) {
        return res.status(400).send({ message: "Missing application ID." });
    }

    try {
        // Find the application by its unique MongoDB _id and delete it
        const result = await managerApplicationCollection.deleteOne({ _id: new ObjectId(id) }); 
        // NOTE: If you are using Mongoose, you use findByIdAndDelete(id) or deleteOne({ _id: id })

        if (result.deletedCount === 1) {
            return res.send({ message: "Application deleted successfully.", deletedCount: 1 });
        } else {
            return res.status(404).send({ message: "Application not found or already deleted.", deletedCount: 0 });
        }
    } catch (error) {
        console.error("Error deleting application:", error);
        res.status(500).send({ message: "Failed to delete application on the server.", error });
    }
});

app.get("/manager/payments", verifyJWT, verifyManager, async (req, res) => {
  try {
    const { managerEmail } = req.query;
    if (!managerEmail) {
      return res.status(400).json({ message: "managerEmail required" });
    }

    // 1️⃣ Clubs managed by this manager
    const clubs = await clubsCollection.find({ managerEmail }).toArray();
    const clubIds = clubs.map(c => c._id.toString());

    // 2️⃣ Events under those clubs
    const events = await eventsCollection.find({
      clubId: { $in: clubIds }
    }).toArray();

    const eventIds = events.map(e => e._id.toString());

    // 3️⃣ Payments (membership + event)
    const payments = await paymentsCollection.find({
      $or: [
        { clubId: { $in: clubIds } },   // club membership payments
        { eventId: { $in: eventIds } }  // event registration payments
      ]
    })
    .sort({ paidAt: -1 })
    .toArray();

    res.json({
      total: payments.length,
      payments
    });

  } catch (err) {
    console.error("Manager Payments Error:", err);
    res.status(500).json({ message: "Failed to load payments" });
  }
});

//search
// GET /api/clubs/search?query=art&category=Arts
app.get("/clubs/search", async (req, res) => {
  const { query = "", category } = req.query;

  const filter = {};

  // Search by name
  if (query) {
    filter.name = { $regex: query, $options: "i" };
  }

  // Filter by multiple categories
  if (category) {
    // Split comma-separated string into array
    const categoriesArray = category.split(",").map(c => c.trim());
    filter.category = { $in: categoriesArray }; // MongoDB $in matches any
  }

  const clubs = await clubsCollection.find(filter).toArray();
  res.json(clubs);
});

app.get("/api/events", async (req, res) => {
  const { category = "all", search = "" } = req.query;

  const pipeline = [
    {
      $lookup: {
        from: "clubs",
        localField: "clubId",
        foreignField: "_id",
        as: "club"
      }
    },
    { $unwind: "$club" }
  ];

  if (category !== "all") {
    pipeline.push({ $match: { "club.category": category } });
  }

  if (search) {
    pipeline.push({
      $match: {
        title: { $regex: search, $options: "i" }
      }
    });
  }

  const events = await eventsCollection.aggregate(pipeline).toArray();
  res.send(events);
});

//contact us
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // ✅ Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email address",
      });
    }

    const contactData = {
      name,
      email,
      message,
      createdAt: new Date(),
    };

    // ✅ Option 1: Save to DB
    await contactCollection.insertOne(contactData);

    // (Optional) Option 2: Send email via nodemailer later

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("Contact error:", error);
    res.status(500).json({
      message: "Failed to send message",
    });
  }
});









//club catagory
// app.get("/api/clubs", async (req, res) => {
//   try {
//     const { category, search } = req.query;
//     let query = {};

//     // 1. Filter by Category if provided
//     if (category) {
//       query.category = category;
//     }

//     // 2. Filter by Search Term if provided
//     if (search) {
//       query.name = { $regex: search, $options: "i" }; // "i" makes it case-insensitive
//     }

//     const clubs = await clubsCollection.find(query).toArray();
//     res.status(200).send(clubs);
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching clubs", error: err });
//   }
// });



// GET / member overview
// app.get("/member/stats", async (req, res) => {
//   try {
//     const { email } = req.query;
//     if (!email) {
//       return res.status(400).json({ error: "Email is required" });
//     }

//     // 1. Memberships (clubId = clubName)
//     const memberships = await membershipsCollection
//       .find({ userEmail: email })
//       .toArray();

//     const clubNames = memberships.map(m => m.clubId);

//     // 2. Clubs (query by name, NOT _id)
//     const clubs = await clubsCollection
//       .find({ clubName: { $in: clubNames } })
//       .project({ clubName: 1, location: 1, bannerImage: 1 })
//       .toArray();

//     // 3. Event registrations (eventId = event title)
//     const registrations = await eventRegistrationsCollection
//       .find({ userEmail: email })
//       .toArray();

//     const eventTitles = registrations.map(r => r.eventId);

//     // 4. Events (query by title)
//     const events = await eventsCollection
//       .find({ title: { $in: eventTitles } })
//       .project({
//         title: 1,
//         clubName: 1,
//         date: 1,
//         location: 1,
//         eventFee: 1
//       })
//       .toArray();

//     // 5. Upcoming events
//     const upcomingEvents = events.filter(
//       e => e.date && new Date(e.date) > new Date()
//     );

//     // 6. Total spent
//     const totalSpent = events.reduce(
//       (sum, e) => sum + (e.eventFee || 0),
//       0
//     );

//     res.json({
//       totalClubs: clubs.length,
//       totalEvents: events.length,
//       totalSpent,
//       myClubs: clubs.map(c => ({
//         id: c._id.toString(),
//         name: c.clubName,
//         location: c.location,
//         bannerImage: c.bannerImage
//       })),
//       upcomingEvents: upcomingEvents.map(e => ({
//         id: e._id.toString(),
//         title: e.title,
//         clubName: e.clubName,
//         date: e.date,
//         location: e.location
//       }))
//     });
//   } catch (err) {
//     console.error("Member stats error:", err);
//     res.status(500).json({ error: "Server error" });
//   }
// });








//payment related api
  //1️⃣ payment
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { membershipFee, clubName, clubId, userEmail } = req.body;

    if (!membershipFee || !clubName || !clubId || !userEmail) {
      return res.status(400).send({ message: "Missing payment data" });
    }

    const amount = parseInt(membershipFee) * 100;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "bdt",
            unit_amount: amount,
            product_data: {
              name: `Please pay for : ${clubName}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        clubId,
        clubName,
      },
      customer_email: userEmail,
      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
    });
    //console.log("SITE_DOMAIN:", process.env.SITE_DOMAIN);
    

    res.json({ url: session.url });

  } catch (error) {
    console.error("Stripe error:", error.message);
    res.status(400).send({ message: error.message });
  }
});


//make history to save
app.patch('/payment-success', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).send({ message: "session_id missing" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).send({ message: "Payment not completed" });
    }

    const transactionId = session.payment_intent;
    if (!transactionId) {
      return res.status(400).send({ message: "Stripe payment_intent missing" });
    }

    // prevent duplicate payment
    const paymentExist = await paymentsCollection.findOne({
      stripePaymentIntentId: transactionId
    });

    if (paymentExist) {
      return res.send({
        success: true,
        trackingId: paymentExist.trackingId,
        transactionId
      });
    }

    const trackingId = generateTrackingId();

    // 1️⃣ Save payment
    await paymentsCollection.insertOne({
      amount: session.amount_total / 100,
      currency: session.currency,
      userEmail: session.customer_email,
      type: "membership",
      clubId: session.metadata.clubId,
      clubName: session.metadata.clubName,
      stripePaymentIntentId: transactionId,
      paymentStatus: session.payment_status,
      paidAt: new Date(),
      trackingId
    });

    // 2️⃣ Save membership
    await membershipsCollection.insertOne({
      userEmail: session.customer_email,
      clubId: session.metadata.clubId,
      clubName: session.metadata.clubName,
      status: "active",
      paymentId: transactionId,
      joinedAt: new Date(),
      expiresAt: null
    });

    // 3️⃣ SEND RESPONSE ONCE
    res.send({
      success: true,
      trackingId,
      transactionId
    });

  } catch (error) {
    console.error("Payment success error:", error);
    res.status(500).send({ message: "Payment verification failed" });
  }
});

        // payment related apis
        app.get('/payments', verifyJWT,  async (req, res) => {
            const email = req.query.email;
            const query = {}

            //console.log( 'headers', req.headers);

            if (email) {
                query.userEmail = email;

                // check email address
                if (email !== req.tokenEmail) {
                    return res.status(403).send({ message: 'forbidden access' })
                }
            }
            const cursor = paymentsCollection.find(query).sort({ paidAt: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })


//event register session
        // Create Stripe checkout session for event registration
app.post('/create-event-checkout-session', async (req, res) => {
  try {
    const { eventFee, eventTitle, eventId, userEmail } = req.body;

    if (!eventFee || !eventTitle || !eventId || !userEmail) {
      return res.status(400).send({ message: "Missing payment data for event" });
    }

    const amount = parseInt(eventFee) * 100; // Stripe expects amount in smallest currency unit

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "bdt", // your currency
            unit_amount: amount,
            product_data: {
              name: `Event Registration: ${eventTitle}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        eventId,
        eventTitle,
      },
      customer_email: userEmail,
      success_url: `${process.env.SITE_DOMAIN}/dashboard/event-payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/event-payment-cancelled`,
    });

    res.json({ url: session.url });

  } catch (error) {
    console.error("Stripe event checkout error:", error.message);
    res.status(400).send({ message: error.message });
  }
});


// event history
app.patch('/event-payment-success', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).send({ message: "session_id missing" });
    console.log("Session ID:", sessionId);

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).send({ message: "Payment not completed" });
    }

    
    const transactionId = session.payment_intent;

    // prevent duplicate
    const paymentExist = await paymentsCollection.findOne({ stripePaymentIntentId: transactionId });
    if (paymentExist) {
      return res.send({
        message: 'Payment already recorded',
        trackingId: paymentExist.trackingId,
        transactionId
      });
    }

    // Save payment info
    const trackingId = generateTrackingId(); // make sure this function exists
 console.log("Tracking ID:", trackingId);

    const payment = {
      amount: session.amount_total / 100,
      currency: session.currency,
      userEmail: session.customer_email,
      eventId: session.metadata.eventId,
      eventTitle: session.metadata.eventTitle,
      stripePaymentIntentId: transactionId,
      paymentStatus: session.payment_status,
      type: "event",
      paidAt: new Date(),
      trackingId
    };
   
    await paymentsCollection.insertOne(payment);
      console.log("Payment saved");

// Save registration
    await eventRegistrationsCollection.insertOne({
      eventId: session.metadata.eventId,
      userEmail: session.customer_email,
      status: "registered",
      paymentId: transactionId,
      registeredAt: new Date()
    });
    

    res.send({
      success: true,
      trackingId,
      transactionId,
      
    });

    
    

  } catch (error) {
    console.error("Event payment success error:", error);
    res.status(500).send({ message: "Event payment verification failed" });
  }
});



// Admin overview
app.get("/admin/stats", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    // 1️⃣ Basic counts
    const totalUsers = await usersCollection.countDocuments();
    const totalClubs = await clubsCollection.countDocuments();
    const totalEvents = await eventsCollection.countDocuments();

    // 2️⃣ Total revenue (from payments)
    const revenueAgg = await paymentsCollection.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]).toArray();

    const totalRevenue = revenueAgg[0]?.total || 0;

    // 3️⃣ Clubs by status
    const clubsByStatusAgg = await clubsCollection.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const clubsByStatus = {
      approved: 0,
      pending: 0,
      rejected: 0,
    };

    clubsByStatusAgg.forEach(item => {
      if (item._id) {
        clubsByStatus[item._id] = item.count;
      }
    });

    // 4️⃣ Clubs by membership (for BarChart)
    const clubsByMembershipAgg = await membershipsCollection.aggregate([
  {
    $addFields: {
      clubObjectId: { $toObjectId: "$clubId" }
    }
  },
  {
    $lookup: {
      from: "clubs",
      localField: "clubObjectId",
      foreignField: "_id",
      as: "club"
    }
  },
  { $unwind: "$club" },
  {
    $group: {
      _id: "$club.clubName",
      members: { $sum: 1 }
    }
  }
]).toArray();
    //console.log("Membership agg:", clubsByMembershipAgg);


    const clubsByMembership = {};
    clubsByMembershipAgg.forEach(item => {
      clubsByMembership[item._id] = item.members;
    });

    // 5️⃣ Recent activity (last 5 registrations)
    const recentRegistrations = await eventRegistrationsCollection
      .find()
      .sort({ registeredAt: -1 })
      .limit(5)
      .toArray();

    const recentActivity = recentRegistrations.map(reg => ({
      message: `${reg.userEmail} registered for an event`,
      time: new Date(reg.registeredAt || Date.now()).toLocaleString()
    }));

    // ✅ Final response (MATCHES frontend)
    res.json({
      totalUsers,
      totalClubs,
      totalEvents,
      totalRevenue,
      clubsByStatus,
      clubsByMembership,
      recentActivity
    });

  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ message: error.message });
  }
});




// member overview
app.get("/member/stats", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
console.log("EMAIL FROM QUERY:", email);
    // 1. Memberships
    const memberships = await membershipsCollection
      .find({ userEmail: email })
      .toArray();

    const clubIds = memberships.map(m => new ObjectId(m.clubId));

    // 2. Clubs
    const clubs = await clubsCollection
      .find({ _id: { $in: clubIds } })
      .project({ clubName: 1, location: 1, bannerImage: 1 })
      .toArray();

    // 3. Event registrations
    const registrations = await eventRegistrationsCollection
      .find({ userEmail: email })
      .toArray();

   const eventIds = registrations.map(r => new ObjectId(r.eventId));


    // 4. Events
    const events = await eventsCollection
  .find({ _id: { $in: eventIds } })
  .project({ title: 1, clubName: 1, date: 1, location: 1, eventFee: 1 })
  .toArray();

    // 5. Upcoming events
    const upcomingEvents = events.filter(
      e => e.date && new Date(e.date) > new Date()
    );

    // 6. Total spent (BETTER)
    const payments = await paymentsCollection
      .find({ userEmail: email })
      .toArray();

    const totalSpent = payments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    res.json({
      totalClubs: clubs.length,
      totalEvents: events.length,
      totalSpent,
      myClubs: clubs.map(c => ({
        id: c._id.toString(),
        name: c.clubName,
        location: c.location,
        bannerImage: c.bannerImage
      })),
      upcomingEvents: upcomingEvents.map(e => ({
        id: e._id.toString(),
        title: e.title,
        clubName: e.clubName,
        date: e.date,
        location: e.location
      }))
    });
    console.log({ memberships, clubs, events });

  } catch (err) {
    console.error("Member stats error:", err);
    res.status(500).json({ error: "Server error" });
  }
});





//overview manger
app.get("/manager/stats",verifyJWT, verifyManager, async (req, res) => {
  // Use req.decoded.email because that's what verifyJWT provides
  const emailFromToken = req.decoded?.email; 
  const emailFromQuery = req.query.email;

  // Comparison check
  if (!emailFromToken || emailFromQuery !== emailFromToken) {
    return res.status(403).json({ message: "Unauthorized: Email mismatch" });
  }
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Manager email required" });

    // 1️⃣ Get all clubs managed by this manager
    const clubs = await clubsCollection.find({ managerEmail: email }).toArray();
    const clubIds = clubs.map(c => c._id.toString());

    // 2️⃣ Get all memberships of these clubs
    const memberships = await membershipsCollection.find({ clubId: { $in: clubIds } }).toArray();
    const totalMembers = memberships.length;

    // 3️⃣ Get all events for these clubs
    const events = await eventsCollection.find({ clubId: { $in: clubIds } }).toArray();

    // 4️⃣ Get all event registrations (payments)
    const registrations = await paymentsCollection.find({
      $or: [
        { clubId: { $in: clubIds } },
        { eventId: { $in: events.map(e => e._id.toString()) } }
      ]
    }).toArray();

    // 5️⃣ Count registrations for each event
    const eventStats = events.map(event => {
      const count = registrations.filter(r => r.eventId === event._id.toString()).length;
      return {
        id: event._id,
        title: event.title,
        date: event.eventDate,
        clubName: clubs.find(c => c._id.toString() === event.clubId)?.clubName || "Unknown",
        maxAttendees: event.maxAttendees,
        registrations: count
      };
    });

    // 6️⃣ Total revenue (memberships + events)
    const membershipRevenue = memberships.reduce((sum, m) => sum + (Number(m.membershipFee) || 0), 0);
    const eventRevenue = registrations.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalRevenue = membershipRevenue + eventRevenue;

    res.json({
      totalClubs: clubs.length,
      totalMembers,
      totalEvents: events.length,
      totalRevenue,
      recentClubs: clubs.slice(-5).map(c => ({
        id: c._id,
        name: c.clubName,
        bannerImage: c.bannerImage,
        memberCount: memberships.filter(m => m.clubId === c._id.toString()).length,
        status: c.status
      })),
      upcomingEvents: eventStats.slice(0, 5)
    });

  } catch (err) {
    console.error("Manager Stats Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});







    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}



run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
