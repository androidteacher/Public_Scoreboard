const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
const { isAuthenticated } = require('./middleware/auth');

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for simple inline scripts/styles if needed, or configure properly
}));

// Body parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Session setup
app.use(session({
    store: new SQLiteStore({ dir: 'data', db: 'sessions.db' }),
    secret: 'super-secret-key-change-this-in-prod', // In a real app, use ENV var
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// View engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');

app.use('/', publicRoutes); // Mount public routes (index, stats, user/:id)
app.use('/', authRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session });
});

module.exports = app;
