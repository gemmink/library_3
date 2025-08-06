const express = require('express');
const router = express.Router();

module.exports = (database) => {
    router.post('/', async (req, res) => {
        if (req.session.user !== undefined) {
            try {
                let book_id = req.body.borrow_books;
                if (!Array.isArray(book_id)) {
                    book_id = [book_id];
                }
                book_id = book_id.map(i => parseInt(i));

                await database.collection('books').updateMany(
                    { ID: { $in: book_id } },
                    { $set: { Available: false } }
                );

                await database.collection('users').updateOne(
                    { Username: req.session.user },
                    { $addToSet: { IDBooksBorrowed: { $each: book_id } } }
                );

                res.redirect('/sign_in');
            } catch (err) {
                console.log("Borrow error:", err);
                res.status(500).send("Internal server error");
            }
        } else {
            res.redirect('/sign_in');
        }
    });

    return router;
};