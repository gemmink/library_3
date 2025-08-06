const express = require('express');
const handlebars = require("express-handlebars");
const app = express();
const path = require('path');
const fs = require('fs');


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

const rawdata_users = fs.readFileSync('./users.json');
const data = JSON.parse(rawdata_users);


app.use(
    session({
        name: 'mySession',          // ≈ cookieName
        secret: str_random,         // same as before
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

app.get('/', async (req, res) => {
    res.render("landing");
})

app.get('/log_out',
    (req, res) => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    }
);
app.get('/sign_in', async (req, res) => {
    console.log(req.session);
    if (req.session.user !== undefined) {
        const user = await database.collection('users').findOne(
            { Username: req.session.user},
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

        res.render('home', {user: req.session.user, books: rows});
    } else if (req.session.message !== undefined) {
        res.render("sign_in", {"message": req.session.message});
        req.session.message = undefined;
    } else {
        res.render("sign_in", {});
    }
});
app.post('/submit', (req, res) => {
        console.log(req.body);
        const username = req.body.user;
        const password = req.body.pass;
        if (username in data) {
            if (password == data[username]) {
                req.session.user = username;
                res.redirect('/sign_in');
            } else {
                req.session.message = "Not a valid password";
                res.redirect('/sign_in');
            }
            console.log("user in");
        } else {
            req.session.message = "Not a valid username";
            res.redirect('/sign_in',);
        }
    }
)

app.post('/return_books', async (req, res) => {
    if(req.session.user !== undefined) {
    try {
        let book_id = req.body.return_books;
        console.log(book_id);
        if (Array.isArray(book_id)===false) {
            book_id = [book_id];
        }
        book_id = book_id.map(i=>parseInt(i))
        const result = await database.collection('books').updateMany(
            {ID: {$in: book_id}},
            {$set: {Available: true}}
        );
        console.log(typeof book_id)
        await database.collection('users').updateOne(
            { Username: req.session.user },
            { $pull: { IDBooksBorrowed: { $in: book_id } } }
        )
        res.redirect('/sign_in',);
    }
    catch(err)
    {console.log("error");}}
    else{
        res.redirect('/sign_in',);
    }
})

async function main() {
    try {
        await client.connect();  // Connect to MongoDB
        database = client.db("db_library_assignment");
        const borrowRouter = require('./middleware/borrow_books')(database);
        app.use('/borrow_books', borrowRouter);

    } catch (err) {
        console.error("Failure");
        process.exit(1);
    }
}
main()
module.exports = app;
module.exports.handler = serverless(app);