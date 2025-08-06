const express = require('express');
const serverless = require('serverless-http');
const handlebars = require("express-handlebars");
const path = require('path');
const fs = require('fs');
const session = require("express-session");
const randomStr = require("randomstring");
const mongodb = require('mongodb');

const connection_string = "your-mongodb-connection-string";
const client = new mongodb.MongoClient(connection_string);
let database;
const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));

// Handlebars
app.engine('.hbs', handlebars.engine({
    extname: '.hbs',
    partialsDir: path.join(__dirname, '../views', 'partials')
}));
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, '../views'));

// JSON users
const rawdata_users = fs.readFileSync(path.join(__dirname, '../users.json'));
const data = JSON.parse(rawdata_users);

// Session setup
app.use(
    session({
        name: 'mySession',
        secret: randomStr.generate(),
        saveUninitialized: false,
        resave: false,
        rolling: true,
        cookie: {
            maxAge: 3 * 60 * 1000,
            httpOnly: true,
            secure: false,
            sameSite: 'lax'
        }
    })
);

// Connect to Mongo and init routes
let isDbInitialized = false;
async function initDbAndRoutes() {
    if (!isDbInitialized) {
        await client.connect();
        database = client.db("db_library_assignment");

        // mount borrow router
        const borrowRouter = require('../middleware/borrow_books')(database);
        app.use('/borrow_books', borrowRouter);

        isDbInitialized = true;
    }
}

// Routes
app.use(async (req, res, next) => {
    await initDbAndRoutes();
    next();
});

app.get('/', (req, res) => {
    res.render("landing");
});

app.get('/log_out', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/sign_in', async (req, res) => {
    const user = await database.collection('users').findOne(
        { Username: req.session.user },
        { projection: { IDBooksBorrowed: 1, _id: 0 } }
    );
    const userIDs = user?.IDBooksBorrowed || [];

    const rows = await database.collection('books').find({
        $or: [
            { Available: true },
            { ID: { $in: userIDs } }
        ]
    }, {
        projection: { _id: 0, ID: 1, Title: 1, Author: 1, Available: 1 }
    }).sort({ Title: 1 }).toArray();

    res.render('home', { user: req.session.user, books: rows });
});

app.post('/submit', (req, res) => {
    const username = req.body.user;
    const password = req.body.pass;

    if (username in data) {
        if (password === data[username]) {
            req.session.user = username;
            res.redirect('/sign_in');
        } else {
            req.session.message = "Not a valid password";
            res.redirect('/sign_in');
        }
    } else {
        req.session.message = "Not a valid username";
        res.redirect('/sign_in');
    }
});

app.post('/return_books', async (req, res) => {
    if (req.session.user !== undefined) {
        let book_id = req.body.return_books;
        if (!Array.isArray(book_id)) book_id = [book_id];
        book_id = book_id.map(i => parseInt(i));

        await database.collection('books').updateMany(
            { ID: { $in: book_id } },
            { $set: { Available: true } }
        );

        await database.collection('users').updateOne(
            { Username: req.session.user },
            { $pull: { IDBooksBorrowed: { $in: book_id } } }
        );
        res.redirect('/sign_in');
    } else {
        res.redirect('/sign_in');
    }
});

// ✅ Serverless export
module.exports = serverless(app);