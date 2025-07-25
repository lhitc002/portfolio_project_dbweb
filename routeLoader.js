const fs = require('fs');
const path = require('path');
const { Router } = require('express');

const BASE_PATH = '/usr/326';

// Middleware: Enforce URL always starts with BASE_PATH
function enforceBasePath(req, res, next) {
    if (!req.path.startsWith(BASE_PATH)) {
        const query = req.url.slice(req.path.length);
        return res.redirect(BASE_PATH + req.path + query);
    }
    next();
}

// Patch res.redirect globally per response
function patchRedirect(res) {
    if (res._redirectPatched) return;

    const originalRedirect = res.redirect;
    res.redirect = function patchedRedirect(url, ...args) {
        if (typeof url === 'string') {
            if (url.startsWith('/') && !url.startsWith(BASE_PATH) && !url.startsWith('//')) {
                url = BASE_PATH + url;
            }
        }
        return originalRedirect.call(this, url, ...args);
    };

    res._redirectPatched = true;
}

function loadRoutes(app) {
    const routesDir = path.join(__dirname, 'routes');
    const viewsDir = path.join(__dirname, 'views');

    // Insert base path enforcement before routes
    app.use(enforceBasePath);

    // Patch res.redirect sitewide
    app.use((req, res, next) => {
        patchRedirect(res);
        next();
    });

    fs.readdirSync(routesDir)
        .filter(f => f.endsWith('.js'))
        .forEach(file => {
            const isApi = file.startsWith('api-');
            const routeName = path.basename(file, '.js');
            const controller = require(path.join(routesDir, file));
            const router = Router();

            let baseRoute;
            if (isApi) {
                const name = routeName.replace(/^api-/, '');
                baseRoute = `/api/${name}`;
            } else {
                baseRoute = routeName === 'main' ? '' : `/${routeName}`;
            }

            const viewPath = path.join(viewsDir, routeName);

            if (controller.routes) {
                Object.entries(controller.routes).forEach(([def, handlers]) => {
                    const [method = 'get', route] = def.split(' ');
                    const funs = [].concat(handlers).flat().map(h => controller[h] || h).filter(Boolean);
                    router[method.toLowerCase()](route, ...funs);
                });
            } else {
                if (controller.index) {
                    router.get('/', controller.index);
                } else if (fs.existsSync(path.join(viewPath, 'index.ejs'))) {
                    router.get('/', (req, res) => res.render(`${routeName}/index`));
                }

                Object.entries(controller)
                    .filter(([k, v]) => k !== 'index' && typeof v === 'function')
                    .forEach(([k, v]) => router.get(`/${k}`, v));

                if (!isApi && fs.existsSync(viewPath)) {
                    fs.readdirSync(viewPath)
                        .map(subRoute => path.basename(subRoute, '.ejs'))
                        .filter(subRoute => subRoute !== 'index')
                        .forEach(subRoute => {
                            if (!router.stack.find(r => r.route.path === `/${subRoute}`)) {
                                router.get(`/${subRoute}`, (req, res) => res.render(`${routeName}/${subRoute}`));
                            }
                        });
                }
            }

            app.use(BASE_PATH + baseRoute, router);
        });
}

module.exports = loadRoutes;
