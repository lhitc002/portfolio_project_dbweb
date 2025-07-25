const fs = require('fs');
const path = require('path');
const { Router } = require('express');

function loadRoutes(app) {
    const routesDir = path.join(__dirname, 'routes');
    const viewsDir = path.join(__dirname, 'views');

    fs.readdirSync(routesDir)
        .filter(f => f.endsWith('.js'))
        .forEach(file => {
            const isApi = file.startsWith('api-');
            const routeName = path.basename(file, '.js'); // e.g., "api-collections" or "main"
            const controller = require(path.join(routesDir, file));
            const router = Router();

            // Determine baseRoute
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

                // Autogenerate subroutes based on controller function names
                Object.entries(controller)
                    .filter(([k, v]) => k !== 'index' && typeof v === 'function')
                    .forEach(([k, v]) => router.get(`/${k}`, v));

                // Autogenerate subroutes based on views (if no function exists)
                if (!isApi && fs.existsSync(viewPath)) {
                    fs.readdirSync(viewPath)
                        .map(subRoute => path.basename(subRoute, '.ejs'))
                        .filter(subRoute => subRoute !== 'index')
                        .forEach(subRoute => {
                            if (!router.stack.find(r => r.route.path === `/${subRoute}`))
                                router.get(`/${subRoute}`, (req, res) => res.render(`${routeName}/${subRoute}`));
                        });
                }
            }

            app.use(baseRoute, router);
        });
}

module.exports = loadRoutes;