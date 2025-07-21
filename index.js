// Import dotenv (for Environment Variables)
require('dotenv').config();

const express = require('express');
const path = require('path');
const ejs = require('ejs');
const expressLayouts = require('express-ejs-layouts');
const mysql = require('mysql2');
const loadRoutes = require('./routeLoader');

const app = express();
const port = process.env.PORT || 8000;

// Tell Express that we want to use EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'shared/layout'); // refers to views/shared/layout.ejs

// Set up the body parser 
app.use(express.urlencoded({ extended: true }))

// Set up public folder (for css and statis js)
app.use(express.static(__dirname + '/public'))

// Define the database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'continuum_reader_app',
    password: process.env.DB_PASS || 'qwertyuiop',
    database: process.env.DB_NAME || 'continuum_reader',
});

// Connect to the database
db.connect((err) => {
    if (err) {
        throw err
    }
    console.log('Connected to database')
})
global.db = db

// Define our application-specific data
app.locals.appData = {
    appName: process.env.SHOP_NAME || 'Unnamed App'
}

// Dynamically load the route handlers
loadRoutes(app);

// Start the web app listening
app.listen(port, () => console.log(`Node app listening on port ${port}!`))