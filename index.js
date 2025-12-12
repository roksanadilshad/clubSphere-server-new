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

const app = express()
// middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://b12-m11-session.web.app',
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
)
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log(token)

  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)


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


        //  clubs
         app.get("/clubs", async (req, res) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;

  const result = await clubsCollection.find(query).toArray();
  res.send(result);
});

// featuredClubs
         app.get("/featuredClubs",  async (req, res) => {
           try{
                  const clubs = await clubsCollection.find().limit(8).sort({
membershipFee: -1}).toArray()
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
       app.get("/users", verifyJWT, async (req, res) =>{
        const result = await usersCollection.find().toArray();
        res.send(result)
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
        app.get("/users/role/:email", verifyJWT, async (req, res) => {
         const email = req.params.email;
         const user = await usersCollection.findOne({ email });
       
         if (!user) return res.status(404).send({ message: "User not found" });

      res.send({ role: user.role });
        });

 //user Update (admin)
         app.patch("/users/role/:email", verifyJWT, async (req, res)=>{
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

        res.send(user);

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
app.patch("/admin/clubs/approve/:id", async (req, res) => {
  const id = req.params.id;

  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved", updatedAt: new Date() } }
  );

  res.send(result);
});

//reject a club
app.patch("/admin/clubs/reject/:id", async (req, res) => {
  const id = req.params.id;

  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "rejected", updatedAt: new Date() } }
  );

  res.send(result);
});


// POST /memberships - user joins a club
app.post("/memberships", async (req, res) => {
  try {
    const { userEmail, clubId, status, paymentId, joinedAt, expiresAt } = req.body;

    if (!userEmail || !clubId || !status) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const newMembership = {
      userEmail,
      clubId,         // store name instead of ObjectId
      status,
      paymentId: paymentId || null,
      joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null
    };

    const result = await membershipsCollection.insertOne(newMembership);

    res.status(201).json({ success: true, membershipId: result.insertedId, data: newMembership });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


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
app.get('/memberships', async (req, res) => {
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


//leave club
 app.delete("/memberships/:id", async (req, res) => {
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
app.get("/manager/clubs", async (req, res) => {
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
app.get("/clubs/:clubId/members", async (req, res) => {
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
// GET /manager/members?managerEmail=...
app.get("/manager/members", async (req, res) => {
  try {
    const { managerEmail } = req.query;
    if (!managerEmail) return res.status(400).json({ message: "managerEmail required" });

    // Get all clubs managed by this manager
    const clubs = await clubsCollection.find({ managerEmail }).toArray();
    const clubNames = clubs.map(c => c.clubName); // keep using clubName

    // Get memberships for these clubs
    const memberships = await membershipsCollection
      .find({ clubId: { $in: clubNames } })
      .toArray();

    // Get user info
    const userEmails = memberships.map(m => m.userEmail);
    const users = await usersCollection
      .find({ email: { $in: userEmails } })
      .toArray();

    // Merge data
    const members = memberships.map((m) => {
      const user = users.find(u => u.email === m.userEmail);
      return {
        id: m._id,
        name: user?.name || "Unknown",
        email: m.userEmail,
        photoURL: user?.photoURL || null,
        status: m.status,
        joinedAt: m.joinedAt,
        expiryDate: m.expiresAt,
        clubName: m.clubId,
        membershipFee: m.membershipFee || 0,
      };
    });

    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch members" });
  }
});



// Get all events for a manager's clubs
app.get("/manager/events", async (req, res) => {
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


app.post("/events/:id/register", async (req, res) => {
  const { eventId, clubId, userEmail } = req.body;

  if (!eventId || !userEmail || !clubId) {
    return res.status(400).json({ message: "Missing required data" });
  }

  const registration = {
    eventId,      // store event name
    clubId,       // store club name
    userEmail,
    status: "registered",
    paymentId: null,
    registeredAt: new Date(),
  };

  try {
    await eventRegistrationsCollection.insertOne(registration);
    res.status(201).json({ message: "Registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to register" });
  }
});


// GET /events
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
















































//payment related api
app.post('/create-checkout-session', async (req, res) => {
  const { priceId } = req.body;
  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'payment',
    success_url: `${process.env.SITE_DOMAIN}/payment-success`,
    cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
  });
  res.json({ url: session.url });
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
