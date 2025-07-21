const fs = require('fs');
const path = require('path');

function loadRoutes(app) {
    const routesDir = path.join(__dirname, 'routes');
    const viewsDir = path.join(__dirname, 'views');

    fs.readdirSync(routesDir).forEach(file => {
        const routePath = path.join(routesDir, file);
        const stat = fs.statSync(routePath);

        if (stat.isFile() && file.endsWith('.js')) {
            const routeName = path.basename(file, '.js'); // e.g., "main"
            const controller = require(routePath);
            const viewPath = path.join(viewsDir, routeName);

            const baseRoute = `/${routeName === 'main' ? '' : routeName}`;
            const router = require('express').Router();

            // Bind index (/) route
            if (typeof controller.index === 'function') {
                router.get('/', controller.index);
            } else {
                const defaultIndex = path.join(viewPath, 'index.ejs');
                if (fs.existsSync(defaultIndex)) {
                    router.get('/', (req, res) => res.render(`${routeName}/index`));
                }
            }

            // Autogenerate subroutes based on controller function names
            Object.keys(controller).forEach(fn => {
                if (fn !== 'index' && typeof controller[fn] === 'function') {
                    router.get(`/${fn}`, controller[fn]);
                }
            });

            // Autogenerate subroutes based on views (if no function exists)
            if (fs.existsSync(viewPath)) {
                fs.readdirSync(viewPath).forEach(viewFile => {
                    const subRoute = path.basename(viewFile, '.ejs');
                    const filePath = path.join(viewPath, viewFile);
                    if (subRoute !== 'index' && !router.stack.find(r => r.route?.path === `/${subRoute}`)) {
                        router.get(`/${subRoute}`, (req, res) => res.render(`${routeName}/${subRoute}`));
                    }
                });
            }

            app.use(baseRoute, router);
        }
    });
}

module.exports = loadRoutes;