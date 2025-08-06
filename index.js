const express = require('express');
const handlebars = require("express-handlebars");
const app = express();
const path = require('path');
const fs = require('fs');
const serverless = require('serverless-http');

const session = require("express-session");
const port = 3000;
const randomStr = require("randomstring");
const mongodb = require('mongodb');
const connection_string = "mongodb+srv://mgemmink:gemmink1@lab3cluster.fddoo4b.mongodb.net/?retryWrites=true&w=majority&appName=Lab3Cluster";
const client = new mongodb.MongoClient(connection_string);

let database;

app.use(express.urlencoded({extended: true}));
app.engine('.hbs', handlebars.engine({extname: '.hbs',partialsDir: path.join(__dirname, 'views', 'partials')},
    ));
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, "views"));
const str_random = randomStr.generate();

const rawdata_users = fs.readFileSync(path.join(__dirname, 'users.json'));
const data = JSON.parse(rawdata_users);
console.log(data);

app.use(
    session({
        name: 'mySession',
        secret: str_random,
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
app.use(async (req, res, next) => {
    try {
        if (!database) {
            await client.connect();
            database = client.db("db_library_assignment");
            // The borrow_books middleware now needs to be available after the DB connection
            const borrowRouter = require('./middleware/borrow_books')(database);
            app.use('/borrow_books', borrowRouter);
        }
        // Make the database object available to all routes
        req.db = database;
        next();
    } catch (err) {
        console.error("Database connection failed", err);
        res.status(500).send("Internal Server Error");
    }
});









app.get('/sign_in', async (req, res) => {
    if (req.session.user !== undefined) {
        try {
            const user = await req.db.collection('users').findOne(
                { Username: req.session.user},
                { projection: { IDBooksBorrowed: 1, _id: 0 } }
            );
            const userIDs = user?.IDBooksBorrowed || [];
            const rows = await req.db.collection('books').find({
                $or: [
                    { Available: true },
                    { ID: { $in: userIDs } }
                ]
            }, {
                projection: { _id: 0, ID: 1, Title: 1, Author: 1, Available: 1 }
            }).sort({ Title: 1 }).toArray();

            return res.render('home', {user: req.session.user, books: rows});
        } catch (err) {
            console.error("Error fetching user books:", err);
            return res.status(500).send("Error loading your page.");
        }
    } else if (req.session.message !== undefined) {
        const message = req.session.message;
        req.session.message = undefined; // Clear the message after showing it once
        res.render("sign_in", {"message": message});
    } else {
        res.render("sign_in", {});
    }
});

app.post('/submit', (req, res) => {
    const username = req.body.user;
    const password = req.body.pass;

    if (data[username] && password == data[username]) {
        req.session.user = username;
        res.redirect('/sign_in');
    } else if (data[username]) {
        req.session.message = "Not a valid password";
        res.redirect('/sign_in');
    } else {
        req.session.message = "Not a valid username";
        res.redirect('/sign_in');
    }
});

app.post('/return_books', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/sign_in');
    }
    try {
        let book_id = req.body.return_books;
        if (!book_id) {
            return res.redirect('/sign_in');
        }

        if (!Array.isArray(book_id)) {
            book_id = [book_id];
        }
        const bookIdsAsInt = book_id.map(i => parseInt(i));

        await req.db.collection('books').updateMany(
            { ID: { $in: bookIdsAsInt } },
            { $set: { Available: true } }
        );

        await req.db.collection('users').updateOne(
            { Username: req.session.user },
            { $pull: { IDBooksBorrowed: { $in: bookIdsAsInt } } }
        );

        res.redirect('/sign_in');
    } catch(err) {
        console.error("Error returning books:", err);
        res.redirect('/sign_in');
    }
});

module.exports = app;

