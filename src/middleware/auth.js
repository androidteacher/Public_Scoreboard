function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    if (req.xhr || req.headers.accept.indexOf('json') > -1 || req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.userId && req.session.role === 'admin') {
        return next();
    }
    res.status(403).send('Access Denied');
}

module.exports = { isAuthenticated, isAdmin };
