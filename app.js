const express = require('express');
const ejs = require('ejs');
const db = require('./db');

const app = express();
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads'); // Save uploaded files to the 'public/uploads' folder
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname); // Generate a unique filename
    }
});

const upload = multer({ storage: storage });

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Serve static files from the "public" folder
app.use(express.static('public'));

// Parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home route
app.get('/', (req, res) => {
    const query = 'SELECT * FROM books';
    db.query(query, (err, results) => {
        if (err) throw err;
        res.render('index', { books: results });
    });
});

// Render the borrow page
app.get('/borrow', (req, res) => {
    const query = 'SELECT * FROM users'; // Fetch all users from the database
    db.query(query, (err, results) => {
        if (err) throw err;
        res.render('borrow', { users: results }); // Pass users to the template
    });
});

// Render the add book page
app.get('/add-book', (req, res) => {
    res.render('add-book');
});

// Render the add user page
app.get('/add-user', (req, res) => {
    res.render('add-user');
});



app.post('/books', upload.single('image'), (req, res) => {
    const { title, author, category } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null; // Get the image path

    const query = 'INSERT INTO books (title, author, category, image) VALUES (?, ?, ?, ?)';
    db.query(query, [title, author, category, image], (err, results) => {
        if (err) throw err;
        res.redirect('/'); // Redirect to the home page after adding the book
    });
});

// Add a book
// app.post('/books', (req, res) => {
//     const { title, author, category } = req.body;
//     const query = 'INSERT INTO books (title, author, category) VALUES (?, ?, ?)';
//     db.query(query, [title, author, category], (err, results) => {
//         if (err) throw err;
//         res.redirect('/'); // Redirect to the home page after adding the book
//     });
// });



// Add a user
app.post('/users', (req, res) => {
    const { name, email } = req.body;

    // Check if the email already exists
    const checkEmailQuery = 'SELECT * FROM users WHERE email = ?';
    db.query(checkEmailQuery, [email], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            // Email already exists
            res.render('add-user', { error: 'Email already registered' });
        } else {
            // Insert the new user
            const insertUserQuery = 'INSERT INTO users (name, email) VALUES (?, ?)';
            db.query(insertUserQuery, [name, email], (err, results) => {
                if (err) throw err;
                res.redirect('/borrow'); // Redirect to the borrow page after adding the user
            });
        }
    });
});


// Borrow a book
app.post('/borrow', (req, res) => {
    const { user_id, book_id } = req.body;

    // Check if the book exists and is available
    const checkBookQuery = 'SELECT * FROM books WHERE book_id = ? AND available = TRUE';
    db.query(checkBookQuery, [book_id], (err, bookResults) => {
        if (err) throw err;

        if (bookResults.length === 0) {
            // Book is not available or invalid book_id
            // Fetch users again to populate the dropdown
            const fetchUsersQuery = 'SELECT * FROM users';
            db.query(fetchUsersQuery, (err, userResults) => {
                if (err) throw err;
                res.render('borrow', { 
                    users: userResults, // Pass the list of users
                    error: 'Please enter a valid book ID or the book is not available.'
                });
            });
        } else {
            // Book is available, proceed with borrowing
            const borrowDate = new Date().toISOString().split('T')[0]; // Current date
            const borrowQuery = 'INSERT INTO transactions (user_id, book_id, borrow_date) VALUES (?, ?, ?)';
            db.query(borrowQuery, [user_id, book_id, borrowDate], (err, transactionResults) => {
                if (err) throw err;

                const transaction_id = transactionResults.insertId; // Get the transaction ID

                // Update book availability to FALSE
                db.query('UPDATE books SET available = FALSE WHERE book_id = ?', [book_id], (err, updateResults) => {
                    if (err) throw err;

                    // Fetch users again to populate the dropdown
                    const fetchUsersQuery = 'SELECT * FROM users';
                    db.query(fetchUsersQuery, (err, userResults) => {
                        if (err) throw err;
                        res.render('borrow', { 
                            users: userResults, // Pass the list of users
                            success: `Book borrowed successfully! Transaction ID: ${transaction_id}`
                        });
                    });
                });
            });
        }
    });
});



// Add a user
app.post('/users', (req, res) => {
    const { name, email } = req.body;
    const query = 'INSERT INTO users (name, email) VALUES (?, ?)';
    db.query(query, [name, email], (err, results) => {
        if (err) throw err;
        res.redirect('/borrow'); // Redirect to the borrow page after adding the user
    });
});

// Render the return page
app.get('/return', (req, res) => {
    res.render('return');
});


// Return a book
app.post('/return', (req, res) => {
    const { transaction_id } = req.body;

    // Check if the transaction exists and the book has not been returned
    const checkTransactionQuery = 'SELECT * FROM transactions WHERE transaction_id = ? AND return_date IS NULL';
    db.query(checkTransactionQuery, [transaction_id], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            // Invalid transaction ID or book already returned
            res.render('return', { 
                error: 'Please enter a valid transaction ID or the book has already been returned.'
            });
        } else {
            // Book is being returned
            const returnDate = new Date().toISOString().split('T')[0]; // Current date
            const book_id = results[0].book_id; // Get the book_id from the transaction

            // Update the return_date in the transactions table
            const updateTransactionQuery = 'UPDATE transactions SET return_date = ? WHERE transaction_id = ?';
            db.query(updateTransactionQuery, [returnDate, transaction_id], (err, updateResults) => {
                if (err) throw err;

                // Update the book's availability to TRUE
                const updateBookQuery = 'UPDATE books SET available = TRUE WHERE book_id = ?';
                db.query(updateBookQuery, [book_id], (err, updateBookResults) => {
                    if (err) throw err;

                    // Delete the transaction from the transactions table
                    const deleteTransactionQuery = 'DELETE FROM transactions WHERE transaction_id = ?';
                    db.query(deleteTransactionQuery, [transaction_id], (err, deleteResults) => {
                        if (err) throw err;

                        res.render('return', { 
                            success: 'Return successfully completed and transaction deleted!'
                        });
                    });
                });
            });
        }
    });
});


// Update a book
app.post('/books/update', (req, res) => {
    const { book_id, title, author, category } = req.body;
    const query = 'UPDATE books SET title = ?, author = ?, category = ? WHERE book_id = ?';
    db.query(query, [title, author, category, book_id], (err, results) => {
        if (err) throw err;
        res.redirect('/'); // Redirect to the home page after updating the book
    });
});


// Delete a book
app.delete('/books/delete/:bookId', (req, res) => {
    const bookId = req.params.bookId;
    const query = 'DELETE FROM books WHERE book_id = ?';

    db.query(query, [bookId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to delete the book' });
        }

        // Check if any rows were affected (i.e., if the book was found and deleted)
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Send a success response with a message
        res.status(200).json({ message: 'Book successfully deleted' });
    });
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});