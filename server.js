const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');

// Generate a secure key for session encryption
const generateSecureKey = () => {
    return crypto.randomBytes(32).toString('hex');
};

const secretKey = generateSecureKey(); // Generate a secure key for session encryption

// MySQL connection configuration
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'auth'
});

// Configure session middleware
const sessionStore = new MySQLStore({}, connection);

app.use(session({
    secret: secretKey,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        // maxAge: 86400000,
    }
}));

// Middleware to parse request body
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Configure Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'kanawader328@gmail.com', // Your Gmail address
        pass: 'ffoy htfh ccza shda' // Your Gmail password
    }
});

// Multer configuration for handling file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/songs/uploadedsongs'); // Store uploaded files in 'public/songs/uploadedsongs' directory
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Keep original file name
    }
});

const upload = multer({ storage: storage });

// Signup route
app.post('/signup', (req, res) => {
    const { username, email, password, mobile, country, city, district } = req.body;

    const otp = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: false });

    // Send OTP via Email
    transporter.sendMail({
        from: 'kanawader328@gmail.com',
        to: email,
        subject: 'Email Verification OTP',
        text: `Your OTP for email verification is: ${otp}`
    }, (error, info) => {
        if (error) {
            console.error('Error occurred while sending OTP:', error);
            res.status(500).json({ success: false, message: 'Error occurred while sending OTP' });
            return;
        }

        // Store the OTP in the session to verify later
        req.session.emailVerificationOTP = otp;

        // Redirect to a page where the user enters the OTP
        res.redirect('/verify-email');
    });

    // Check if the email already exists in the database
    connection.query('SELECT * FROM users WHERE email = ?', [email], (error, results) => {
        if (error) {
            console.error('Error occurred while checking email existence:', error);
            res.status(500).json({ success: false, message: 'Error occurred during signup' });
            return;
        }

        // If the email already exists, send a JSON response indicating the error
        if (results.length > 0) {
            res.status(400).json({ success: false, message: 'Email already exists' });
            return;
        }

        // If the email doesn't exist, proceed with the signup process
        // Perform database operations to insert user data
        connection.query(
            'INSERT INTO users (username, email, password, mobile, country, city, district) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, email, password, mobile, country, city, district],
            (error, results) => {
                if (error) {
                    console.error('Error occurred during signup:', error);
                    res.status(500).json({ success: false, message: 'Error occurred during signup' });
                    return;
                }
                // Send a JSON response indicating successful signup
                res.json({ success: true, message: 'Signup successful!' });
            }
        );
    });
});

app.post('/verify-email', (req, res) => {
    const { email, otp } = req.body;

    // Retrieve OTP from session
    const storedOTP = req.session.emailVerificationOTP;

    // Compare the entered OTP with the stored OTP
    if (otp === storedOTP) {
        // Clear the OTP from the session
        delete req.session.emailVerificationOTP;

        // Proceed with the signup process (inserting into the database, etc.)
        // For demonstration, let's assume we're sending a JSON response
        res.json({ success: true, message: 'Email verified successfully.' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }
});

// Login route
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Query the database to find a user with the provided email and password
    connection.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (error, results) => {
        if (error) {
            res.status(500).send('Error occurred during login');
            return;
        }
        if (results.length > 0) {
            // Set session variables with user information
            req.session.email = email;
            req.session.username = results[0].username;
            req.session.mobile = results[0].mobile;
            req.session.country = results[0].country;
            req.session.city = results[0].city;
            req.session.district = results[0].district;

            // Render the dashboard with user information
            res.render('dashboard', {
                username: req.session.username,
                email: req.session.email,
                mobile: req.session.mobile,
                country: req.session.country,
                city: req.session.city,
                district: req.session.district
            });
        } else {
            res.status(401).send('Invalid email or password');
        }
    });
});

// Forgot password route
app.post('/forgot-password', (req, res) => {
    const { email } = req.body;

    // Generate a password reset token
    const token = crypto.randomBytes(20).toString('hex');

    // Store the token in the database along with the user's email
    connection.query('UPDATE users SET reset_token = ? WHERE email = ?', [token, email], (error, results) => {
        if (error) {
            res.status(500).send('Error occurred during password reset');
            return;
        }
        // Send email with password reset link
        const resetLink = `http://localhost:3000/reset-password?token=${token}`;

        // Send the email
        transporter.sendMail({
            from: 'kanawader328@gmail.com', // sender address
            to: email, // list of receivers
            subject: 'Password Reset Link', // Subject line
            html: `Click <a href="${resetLink}">here</a> to reset your password.` // html body
        }, (error, info) => {
            if (error) {
                console.error('Error occurred while sending email:', error);
                res.status(500).send('Error occurred while sending email');
            } else {
                console.log('Email sent:', info.response);
                res.send(`Password reset link sent to ${email}. Please check your email.`);
            }
        });
    });
});

// Reset password route
app.get('/reset-password', (req, res) => {
    const { token } = req.query;

    // Render the password reset form with the token as a hidden input
    res.render('reset-password', { token });
});

// Update password route
app.post('/reset-password', (req, res) => {
    const { token, newPassword } = req.body;

    // Update the user's password in the database using the token
    connection.query('UPDATE users SET password = ?, reset_token = NULL WHERE reset_token = ?', [newPassword, token], (error, results) => {
        if (error) {
            res.status(500).send('Error occurred during password reset');
            return;
        }
        res.send('Password reset successful');
    });
});

// Assuming you're using Express.js
app.get('/dashboard', (req, res) => {
    // Render the dashboard template with session variables
    res.render('dashboard', {
        username: req.session.username,
        email: req.session.email,
        mobile: req.session.mobile,
        country: req.session.country,
        city: req.session.city,
        district: req.session.district
    });
});

// Logout route
app.get('/logout', (req, res) => {
    // Clear the user's session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            // Handle error
            return;
        }
        // Redirect to the login page after logout
        res.redirect('/');
    });
});

// Handle file upload
app.post('/upload', upload.single('mp3File'), (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const uploadedFilePath = req.file.path;
        const filename = req.file.originalname;
        const fileSize = req.file.size;
        const ipAddress = req.ip;

        // Save file details to the database
        const sql = 'INSERT INTO uploaded_files (filename, path, size, ip_address) VALUES (?, ?, ?, ?)';
        connection.query(sql, [filename, uploadedFilePath, fileSize, ipAddress], (err, result) => {
            if (err) {
                console.error('Error saving file details to database:', err);
            } else {
                console.log('File details saved to database:', result);
            }
        });

        // Copy file to second location
        const secondLocation = 'public/songs/all/' + filename;
        fs.copyFile(uploadedFilePath, secondLocation, (err) => {
            if (err) {
                console.error('Error copying file to second location:', err);
            } else {
                console.log('File copied to second location');
            }
        });

        console.log('File uploaded:', req.file.filename);
        res.send('File uploaded successfully!');
    } catch (error) {
        console.error('Error uploading file:', error.message);
        res.status(500).send('Error uploading file');
    }
});

// Handle feedback submission
app.post('/submit_feedback', (req, res) => {
    const { name, email, feedback } = req.body;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Check if the email matches the pattern
    if (!emailPattern.test(email)) {
        console.error('Invalid email address:', email);
        return res.status(400).send('Invalid email address');
    }

    const sql = 'INSERT INTO feedback (name, email, feedback) VALUES (?, ?, ?)';
    connection.query(sql, [name, email, feedback], (err, result) => {
        if (err) {
            console.error('Error submitting feedback:', err);
            res.status(500).send('Error submitting feedback');
        } else {
            console.log('Feedback submitted successfully');
            // Retrieve user's email from feedback
            sendFeedbackEmail(name, email, feedback);
            res.send('Feedback submitted successfully');
        }
    });
});

// Function to send email to user who submitted feedback
function sendFeedbackEmail(name, email, feedback) {
    // Prepare email content
    let mailOptions = {
        from: 'kanawader328@gmail.com', // Sender address
        to: email, // Receiver's email (the user who submitted feedback)
        subject: 'Thank you for your feedback', // Subject line
        text: `Hello ${name},\n\nThank you for your valuable feedback: ${feedback}\n\nBest regards,\nThe Musically Team` // Plain text body
    };

    // Create a Nodemailer transporter
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'kanawader328@gmail.com', // Your Gmail address
            pass: 'ffoy htfh ccza shda' // Your Gmail password
        }
    });

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}

const songsDirectory = 'public/songs'; // Root directory where all song folders are present

// Handle song download
app.get('/download', (req, res) => {
    const { email } = req.query;
    const songName = req.query.songName;
    const ipAddress = req.ip;

    // Iterate through each folder within the songs directory to find the song
    fs.readdir(path.join(__dirname, songsDirectory), (err, folders) => {
        if (err) {
            console.error('Error reading songs directory:', err);
            return res.status(500).send('Internal server error');
        }

        let songFound = false;
        let songPath;

        // Iterate through each folder to find the song
        folders.forEach(folder => {
            const folderPath = path.join(__dirname, songsDirectory, folder);
            const songPathInFolder = path.join(folderPath, songName);
            if (fs.existsSync(songPathInFolder)) {
                songFound = true;
                songPath = songPathInFolder;
            }
        });

        if (!songFound) {
            return res.status(404).send('Song not found');
        }

        // Store email, song details, and IP address in the database
        const sql = 'INSERT INTO downloads (email, song_name, ip_address) VALUES (?, ?, ?)';
        connection.query(sql, [email, songName, ipAddress], (err, result) => {
            if (err) {
                console.error('Error storing download details:', err);
            } else {
                console.log('Download details stored successfully');
                sendDownloadEmail(email, songName);
            }
        });

        // Send the song file to the client for download
        res.download(songPath);
    });
});

// Function to send email to user who downloaded the song
function sendDownloadEmail(email, songName) {
    // Prepare email content
    let mailOptions = {
        from: 'kanawader328@gmail.com', // Sender address
        to: email, // Receiver's email (the user who downloaded the song)
        subject: 'Thank you for downloading', // Subject line
        text: `Hello,\n\nThank you for downloading the song "${songName}". We hope you enjoy it!\n\nBest regards,\nThe Musically Team` // Plain text body
    };

    // Create a Nodemailer transporter
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'kanawader328@gmail.com', // Your Gmail address
            pass: 'ffoy htfh ccza shda' // Your Gmail password
        }
    });

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}








// Serve static files from the public directory
app.use(express.static('public'));

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
