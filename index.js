// Import dotenv (for Environment Variables)
require('dotenv').config();

const express = require('express');
const path = require('path');
const ejs = require('ejs');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const expressSanitizer = require('express-sanitizer');
const MySQLStore = require('express-mysql-session')(session);
const loadRoutes = require('./routeLoader');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8000;

// Use express-session
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

// CORS configuration
const allowedOrigins = [
  'http://www.doc.gold.ac.uk',
  'https://www.doc.gold.ac.uk'
];

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// 1) mount express session
app.use(session({
    key: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// 2) expose session to all views
app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

// Tell Express that we want to use EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'shared/layout'); // refers to views/shared/layout.ejs

// Set up the body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// express sanitizer
app.use(expressSanitizer());

// Set up public folder (for css and statis js)
app.use(express.static(path.join(__dirname, 'public')));

// Define our application-specific data
app.locals.appData = {
    appName: process.env.APP_NAME || 'Unnamed App'
};

app.use((req, res, next) => {
    const depth = req.path.split('/').filter(Boolean).length; // count segments ignoring empty
    res.locals.relativePrefix = '../'.repeat(depth);
    next();
});

// Patch res.redirect
app.use((req, res, next) => {
    const originalRedirect = res.redirect.bind(res);
    res.redirect = function (url) {
        if (typeof url === 'string' && url.startsWith('/')) {
            if (!url.startsWith('/usr/326/')) {
                url = '/usr/326' + (url === '/' ? '/' : url);
            }
        }
        return originalRedirect(url);
    };
    next();
});

app.locals.baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

app.use((req, res, next) => {
    res.locals.baseUrl = app.locals.baseUrl;
    next();
});

// Dynamically load the route handlers
loadRoutes(app);

// Start the web app listening
app.listen(port, () => console.log(`Node app listening on port ${port}!`));