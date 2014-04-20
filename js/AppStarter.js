/**
 * This file loads and starts the game and its UI.
 * Uses (partial) Google Closure annotations: https://developers.google.com/closure/compiler/docs/js-for-compiler.
 * Performance considerations (performance is always an issue in any real-time game):
 *  - Memory:
 *    -> Quick overview: http://stackoverflow.com/questions/8410667/object-pools-in-high-performance-javascript/23180342#23180342
 *    -> Memory pools: http://www.html5rocks.com/en/tutorials/speed/static-mem-pools/
 *    -> Some more info on the JS GC: http://stackoverflow.com/questions/18364175/best-practices-for-reducing-garbage-collector-activity-in-javascript
 *
 */
"use strict";

// configure requirejs
require.config({
    baseUrl: "",
    paths: {
        Lib: "lib",
        //Box2d: "lib/box2djs",

        Util: "js/util",
        Squishy: "lib/squishy/squishy",
        localizer: "lib/localizer",

        JS: "js",
        UI: "js/ui",

        Jquery_root: "lib/jquery",
        jquery: "lib/jquery/jquery-2.1.0.min",
        jquery_ui: "lib/jquery/jquery-ui-1.10.4.min",
        jquery_ui_layout: "lib/jquery/jquery.layout-1.3.0-rc30.79.min"
    },
    shim: {
        jquery: {
            exports: '$'
        },
        jquery_ui: {
            deps: ['jquery']
        },
        jquery_ui_layout: {
            deps: ['jquery', 'jquery_ui']
        }
    }
});

/**
 * All dependencies of SimplePlatformer.
 * @const
 */
var dependencies = [
    // JQuery, UI & Layout
    "jquery", "jquery_ui", "jquery_ui_layout",

    // Other UI elements
    "Lib/mousetrap.min",

    // Math utilities
    "JS/vec2",

    // Other utilities
    "Squishy", "Lib/GameAI",
    "localizer"
];


// load game and initialize UI
require(dependencies, function (jquery, jqueryUI, jqueryUILayout, mousetrap, vec2, squishy) {


    // #######################################################################################################################
    // AI stuff

    /**
     * All possible agent actions.
     * In this world, all possible moves indicate velocity directions.
     * @const
     */
    var AgentAction = squishy.makeEnum([
        "startMoveLeft", "startMoveRight", "stopMove", "jump"
    ]);


    // #######################################################################################################################
    // Shapes & Surfaces

    /**
     * Simple AABB storage class.
     * @constructor
     */
    var AABB = squishy.createClass(
        function(min, max) {
            this.min = min;
            this.max = max;
            vec2.subtract(this.dimensions, max, min);
        },{
            getArea: function () {
                return this.dimensions[Axis.X] * this.dimensions[Axis.Y];
            },
        }
    );
    
    /**
     * Defines all currently implemented shapes.
     * @const
     */
    var ShapeType = squishy.makeEnum([
        "AABB"
    ]);

    /**
     * Defines all currently implemented surfaces.
     * @const
     */
    var SurfaceType = squishy.makeEnum([
        "LineSegment"
    ]);
    
    /**
     * A simple oriented 2D surface.
     * Implemented by LineSegment (and possibly some simple non-linear surface types, such as parabola).
     * @constructor
     * @interface
     */
    var Surface = squishy.createClass(
        function() {
        },{
            // methods
            
            getSurfaceType: squishy.abstractMethod()
        }
    );

    /**
     * Axis-aligned line segment.
     *
     * @constructor
     * @implements {Surface}
     * @param {Vec2} from First endpoint of the line segment.
     * @param {Vec2} to Second endpoint of the line segment.
     * @param {Vec2} normal Surface normal, pointing outwards.
     */
    var LineSegment = squishy.extendClass(Surface,
        function (from, to, normal, dontNormalizeNormal) {
            this._base();
            
            if (!dontNormalizeNormal) {
                vec2.normalize(normal, normal);
            }
            
            this.from = from;
            this.to = to;
            this.normal = normal;
            vec2.subtract(this.delta, this.to, this.from);        // the vector pointing from "from" to "to"
        }, {
            // methods
            getSurfaceType: function() { return SurfaceType.LineSegment; },
        }
    );

    // TODO: General line segments
    // TODO: Curved surfaces

    /**
     * Defines all methods to be implemented by any shape class.
     *
     * @interface
     */
    var Shape = squishy.createClass(
        function() {
        },{
            // methods
            getShapeType: squishy.abstractMethod(),
            getSurfaces: squishy.abstractMethod(),
            getArea: squishy.abstractMethod(),
            getVertices: squishy.abstractMethod(),      // currently, collision detection only works with linearized surfaces
            containsPoint: squishy.abstractMethod(),
        }
    );
    
    /**
     *
     * @constructor
     * @implements {Shape}
     */
    var AABBShape = squishy.extendClass(Shape,
        function (minVertex, maxVertex) {
            this._base();
        
            this.min = minVertex;
            this.max = maxVertex;
            vec2.subtract(this.dimensions, this.max, this.min);
            
            // build line segments to outline the box
            var a = this.min;
            var b = vec2.CopyGet(this.min);
            b[Axis.X] = this.max[Axis.X];
            var c = this.max;
            var d = vec2.CopyGet(this.min);
            d[Axis.Y] = this.max[Axis.Y];
            
            this.vertices = [a, b, c, d];
            
            this.surfaces = [];
            this.surfaces.push(new LineSegment(a, b, vec2.subtract(vec2.create(), a, d)));
            this.surfaces.push(new LineSegment(b, c, vec2.subtract(vec2.create(), b, a)));
            this.surfaces.push(new LineSegment(c, d, vec2.subtract(vec2.create(), c, b)));
            this.surfaces.push(new LineSegment(d, a, vec2.subtract(vec2.create(), d, c)));
        },{
            // methods

            /**
             * Return the type of this shape.
             */
            getShapeType: function () {
                return ShapeType.AABB;
            },
            
            getSurfaces: function() {
                return this.surfaces;
            },

            getArea: function () {
                return this.dimensions[Axis.X] * this.dimensions[Axis.Y];
            },

            /**
             * Width and height of this box.
             */
            getDimensions: function () {
                return this.dimensions;
            },
            
            /**
             * Test whether this object contains the given point in the given coordinate system.
             */
            containsPoint: function(point) {
                var x = point[Axis.X];
                var y = point[Axis.Y];
                
                return x >= this.min[Axis.X] && x <= this.max[Axis.X] && y >= this.min[Axis.Y]  && y <= this.max[Axis.Y];
            }
        }
    );


    // #######################################################################################################################
    // RigidBody class

    /**
     * Creates a new static RigidBody.
     * @constructor
     */
    var RigidBody = squishy.createClass(
        function (objectDefinition) {
            // copy all parameters into object
            squishy.clone(objectDefinition, false, this);

            // objects must have a position and a shape
            squishy.assert(vec2.isValid(this.position), "position is invalid.");
            squishy.assert(this.shape, "shape was not defined.");
        }, {
            // methods
            getShape: function () {
                return this.shape;
            },

            /**
             * Wether this is an agent. Agents can move and can die.
             */
            isAgent: function () {
                return false;
            },

            /**
             * Static objects or agents without health are dead.
             */
            isAlive: function () {
                return this.health > 0;
            },

            /**
             * Currently, only living agents can move.
             */
            canMove: function () {
                return false;
            },
            
            /**
             * Test whether this object contains the given point in world coordinates.
             */
            containsPoint: function(worldPoint) {
                // Transform to object-local coordinate system.
                // Currently, only translations are supported, so a change of coordinate systems can only change the origin.
                var localPoint = vec2.subtract(worldPoint, worldPoint, this.position);
                return this.shape.containsPoint(localPoint);
            }
        }
    );


    // #######################################################################################################################
    // Movable class

    /**
     * In-world objects that may be moved, and thus have velocity and acceleration.
     *
     * @constructor
     */
    var Movable = squishy.extendClass(RigidBody,
        function (objectDefinition) {
            this._base(objectDefinition);

            // movables have velocity and acceleration
            squishy.assert(vec2.isValid(this.velocity), "velocity is invalid.");
            squishy.assert(vec2.isValid(this.acceleration), "acceleration is invalid.");

        }, {
            // methods

            /**
             * Wether this is an agent. Agents can move and die.
             */
            canMove: function () {
                return true;
            },

            /**
             * Whether this object is currently not touching ground.
             */
            isFalling: function () {
                return falling;
            },

            /**
             * Movable is back on the ground and thus cannot be affected by .
             */
            onHitGround: function () {
                this.onGround = true;
            }
        }
    );


    // #######################################################################################################################
    // Agent class

    /**
     * In-world objects that may perform actions to alter their own and/or other world state.
     *
     * @constructor
     */
    var Agent = squishy.extendClass(Movable,
        function (objectDefinition) {
            this._base(objectDefinition);

            // agents start alive
            squishy.assert(this.maxHealth > 0);
            this.health = objectDefinition.maxHealth;
        }, {
            // methods

            /**
             * Wether this is an agent. Agents can move and die.
             */
            isAgent: function () {
                return true;
            },


            // Agent actions

            /**
             *
             */
            jump: function () {
                squishy.assert(this.canMove(), "Immovable object is trying to jump: " + this);
            },

            /**
             * Let this agent perform the given physical action.
             */
            performAction: function (action) {
                switch (action) {
                case (AgentAction.startMoveLeft):
                    break;
                case (AgentAction.startMoveRight):
                    break;
                case (AgentAction.stopMove):
                    break;
                case (AgentAction.jump):
                    break;
                }
            }
        }
    );


    // #######################################################################################################################
    // Game class

    /**
     * Creates a new Platformer game.
     * A game can, theoretically, contain multiple worlds.
     * @constructor
     * @param {b2AABB} worldBox Defines the bounds of the world.
     */
    var SimplePlatformerGame = squishy.createClass(
        function (gameConfig, worldConfig) {
            this.gameConfig = gameConfig;
            this.world = new SimplePlatformerWorld(worldConfig);
        },{
            
        }
    );

    // #######################################################################################################################
    // World class & accessories
    
    var CollisionPair = squishy.createClass(
        function() {
        },{
            setObjects: function(obj1, obj2) {
                this.obj1 = obj1;
                this.obj2 = obj2;
            },
            
            updateInfo: function(currentIteration) {
                this.lastActiveIteration = currentIteration;
            }
        }
    );
    
    /**
     * Stores collision pairs and avoids duplicate reporting.
     * Also provides a pool for CollisionPair objects to reduce GC intervention.
     * @see http://bullet.googlecode.com/files/GDC10_Coumans_Erwin_Contact.pdf
     */
    var CollisionList = squishy.createClass(
        function() {
            this.pairs = {};
            this.pairPool = [];             // collision pair pool
            this.currentIteration = -1;     // current iteration helps us determine whether a pair is obsolete
        },{
            setCurrentIteration: function(it) { this.currentIteration = it; },
            
            /**
             * Establishes an order on RigidBody objects.
             * We want more frequently colliding objects listed first.
             * For now, we use a simple heuristic:
             * Movable objects generally collide more often (almost all the time), so they come first.
             *
             * @return {Bool} Returns true if obj1 comes first.
             */
            compareObjects(obj1, obj2) {
                var isObj1Movable = obj1 instanceof Movable;
                var isObj2Movable = obj2 instanceof Movable;
                if (isObj1Movable == isObj2Movable) {
                    // same type -> sort by ID
                    return obj1.objectId - obj2.objectId > 0;
                }
                // movable objects are greater than non-movable ones.
                return isObj1Movable ? true : false;
            },
            
            addPair: function(obj1, obj2) {
                // in order to identify this pair, we need to establish an order between the two objects
                if (!compareObjects(obj1, obj2)) {
                    // swap the order of the two
                    var tmp = obj2;
                    obj2 = obj1;
                    obj1 = obj2;
                }
                
                // get or create CollisionPair
                var pair = this.getOrCreatePair(obj1, obj2);
                
                return pair;
            },
            
            getOrCreatePair: function(obj1, obj2) {
                // get or create collision list
                var obj1CollisionList = this[obj1.objectId];
                if (!obj1CollisionList) {
                    obj1CollisionList = this[obj1.objectId] = {};
                }
                
                var pair = obj1CollisionList[obj2.objectId];
                if (!pair) {
                    // get or create uninitialized pair
                    if (this.pairPool.length > 0) {
                        var idx = this.pairPool.length-1;
                        pair = pairPool[idx];           // get last element
                        delete pairPool[idx];           // remove from pool
                    }
                    else {
                        pair = new CollisionPair();
                    }
                    
                    // place pair in list
                    obj1CollisionList[obj2.objectId] = pair;
                    
                    // store objects in pair
                    pair.setObjects(obj1, obj2);
                }
                
                // TODO: update collision info
                pair.updateInfo(this.currentIteration);
                return pair;
            },
            
            clearPool: function() {
                
            }
        }
    );

    /**
     * Creates a new Platformer world.
     * This handles the physical aspect of the game, especially movement.
     *
     * @constructor
     * @param {b2AABB} worldBox Defines the bounds of the world.
     */
    var SimplePlatformerWorld = squishy.createClass(
        function (config) {
            config.dt = config.dt || 60;            // set default dt
            
            // check parameter validity
            squishy.assert(config, "config is undefined");
            squishy.assert(config.dt > 0, "config.dt is invalid"); // must be positive
            squishy.assert(vec2.isValid(config.gravity));
            squishy.assert(config.worldBox && config.worldBox.getArea() > 0, "config.worldBox is invalid");

            this.lastObjectId = 0; // running id for new objects

            // assign properties
            this.config = config;

            // create set of all objects & movables in this world
            this.objects = {};
            this.movables = {};
            this.collisions = new CollisionList();

            // create all world events
            this.events = {
                /**
                 * Platformer starts. args = configuration + all initially visible objects.
                 */
                started: squishy.createEvent(this),

                /**
                 * Object moved. args = updated object state
                 */
                objectMoved: squishy.createEvent(this),

                /**
                 * A new object has become visible (or was added into the world).
                 */
                objectAdded: squishy.createEvent(this),

                /**
                 * Object is no longer visible. args = object id
                 */
                objectGone: squishy.createEvent(this),

                /**
                 * An agent died. args = object id
                 */
                agentDead: squishy.createEvent(this),

                /**
                 * The world progressed by the given time delta. args = dt
                 */
                step: squishy.createEvent(this),
            };
        }, {
            // methods

            // ####################################################################################
            // Object management
            
            /**
             * Adds the given object to the world.
             */
            addObject: function (obj) {
                // assign id to object, if it does not exist yet
                obj.objectId = obj.objectId || ++this.lastObjectId;

                // make sure, objects cannot be added twice
                squishy.assert(!this.objects[obj.objectId], "Object was added twice: " + obj);

                // add object
                this.objects[obj.objectId] = obj;
                if (obj instanceof Movable) {
                    this.movables[obj.objectId] = obj;
                }

                // fire event
                this.events.objectAdded.fire(obj);
            },

            /**
             * Removes the given object from the world
             */
            removeObject: function (obj) {
                // fire event
                this.events.objectGone.fire(obj);

                // delete
                delete this.objects[obj.objectId];
                if (obj instanceof Movable) {
                    delete this.movables[obj.objectId];
                }
            },
            
            
            // ####################################################################################
            // Object queries
            
            /**
             * Call the given function for every object that intersects with the given point.
             */
            foreachObjectAtPoint: function(_point, callback) {
                // TODO: These kinds of single temporaries (point) are evil bottlenecks.
                // It makes parallelization practically impossible for the run-time optimizer.
                var point = vec2.create();
                for (var objectId in this.objects) {
                    if (!this.objects.hasOwnProperty(objectId)) continue;
                    var obj = this.objects[objectId];
                    vec2.copy(point, _point);         // copy point, because it will be modified
                    if (obj.containsPoint(point)) {
                        callback(obj);
                    }
                }
            },
            

            // ####################################################################################
            // World physics simulation

            /**
             * Advance step by given amount of time. Uses config.dt, if dt is not given.
             */
            step: function (dt) {
                dt = dt || this.config.dt;

                // update velocity and position
                this.integrateStep();

                // detect collisions
                squishy.forEachOwnProp(this.movables, this.checkCollision);

                // resolve collisions

                // run event listeners
                this.events.step.fire(dt);
            },
            
            checkCollision: function (movableId, movable) {
                // TODO: Build kd-tree, BVI or other accelerating data structure to minimize collision search space
                // check against every other possibly colliding object
                for (var objectId in this.objects) {
                    if (!this.objects.hasOwnProperty(objectId)) continue;
                    if (movableId == objId) continue; // don't check intersection with itself (bodies are assumed to be rigid)
                    var obj = this.objects[objectId];
                    
                    // use continuous collision detection to prevent collisions (basically, collision resolution will roll back time)
                    // if only working with linear line segments, continuous collision detection is simple:
                    // If one of the two segment vertices have traversed another segment, we have a collision.
                    
                    var vertices = obj.getVertices();
                    
                    //    collisions.addPair(movable, obj);
                }
            },
            
            /**
             * Compute new linear velocities and positions.
             */
            integrateStep: function (dt) {
                // Linear integration: We do not support angular velocity or rotation, which makes things a whole lot easier.
                // We first integrate acceleration to update velocity, then integrate velocity to get new position.
                // This is called semi-implicit Euler integration: It is fast, simple and inaccurate (but good enough for linear integration in games).
                squishy.forEachOwnProp(this.movables, function (objId, obj) {
                    vec2.Add(obj.velocity, vec2.MulSGet(obj.acceleration, dt));
                    
                    this.lastPositionDelta = vec2.MulSGet(obj.velocity, dt);
                    vec2.Add(obj.position, this.lastPositionDelta);
                }.bind(this));
            }
        }
    );

    // #######################################################################################################################
    // Canvas Utilities
    

    /**
     * In theory, SVGMatrix will be used by the Canvas API in the future;
     * In practice, we can borrow an SVG matrix today!
     * @see https://developer.mozilla.org/en/docs/Web/API/SVGMatrix
     * @return {SVGMatrix}
     */
    var createMatrix = function () {
        var svgNamespace = "http://www.w3.org/2000/svg";
        return document.createElementNS(svgNamespace, "g").getCTM();
    };
    
    /**
     * Multiples the given SVMMatrix with the given 2-component array, representing a vector and stores the result in vec.
     * @see http://stackoverflow.com/questions/7395813/html5-canvas-get-transform-matrix
     */
    var MVMulSVG = function(matrix, vec) {
        var x = vec[0], y = vec[1];
        vec[0] = x * matrix.a + y * matrix.c + matrix.e;
        vec[1] = x * matrix.b + y * matrix.d + matrix.f;
   };

    //`enhanceCanvas` takes a 2d canvas and wraps its matrix-changing
    //functions so that `context._matrix` should always correspond to its
    //current transformation matrix.
    //Call `enhanceCanvas` on a freshly-fetched 2d canvas for best results.
    var enhanceCanvas = function (canvas) {
        var context = canvas.getContext('2d');
        var m = createMatrix();
        squishy.assert(!context._matrix, "trying to re-enhance canvas");
        context._matrix = m;

        //the stack of saved matrices
        context._savedMatrices = [m];

        var super_ = context.__proto__;
        context.__proto__ = ({
            getMatrix: function () {
                return this._matrix;
            },
            
            getInverseMatrix: function () {
                return this._matrix.inverse();
            },

            //helper for manually forcing the canvas transformation matrix to
            //match the stored matrix.
            _setMatrix: function () {
                var m = this._matrix;
                super_.setTransform.call(this, m.a, m.b, m.c, m.d, m.e, m.f);
            },

            save: function () {
                this._savedMatrices.push(this._matrix);
                super_.save.call(this);
            },

            //if the stack of matrices we're managing doesn't have a saved matrix,
            //we won't even call the context's original `restore` method.
            restore: function () {
                if (this._savedMatrices.length == 0)
                    return;
                super_.restore.call(this);
                this._matrix = this._savedMatrices.pop();
                this._setMatrix();
            },

            scale: function (x, y) {
                this._matrix = this._matrix.scaleNonUniform(x, y);
                super_.scale.call(this, x, y);
            },

            rotate: function (theta) {
                //canvas `rotate` uses radians, SVGMatrix uses degrees.
                this._matrix = this._matrix.rotate(theta * 180 / Math.PI);
                super_.rotate.call(this, theta);
            },

            translate: function (x, y) {
                this._matrix = this._matrix.translate(x, y);
                super_.translate.call(this, x, y);
            },

            transform: function (a, b, c, d, e, f) {
                var rhs = createMatrix();
                //2x2 scale-skew matrix
                rhs.a = a;
                rhs.b = b;
                rhs.c = c;
                rhs.d = d;

                //translation vector
                rhs.e = e;
                rhs.f = f;
                this._matrix = this._matrix.multiply(rhs);
                super_.transform.call(this, a, b, c, d, e, f);
            },

            resetTransform: function () {
                super_.resetTransform.call(this);
                this.onResetTransform();
            },
            
            /**
             * The internally stored transform is reset when canvas width and/or height are set, or when resetTransform is called.
             */
            onResetTransform: function() {
                this._matrix = createMatrix();
            },

            __proto__: super_,
            
            
            /**
             * @see http://stackoverflow.com/questions/808826/draw-arrow-on-canvas-tag
             */
            drawArrow: function(fromVec, dirVec, headLen){
                headLen = headLen || 10;   // length of head in pixels
                var fromx = fromVec[Axis.X], fromy = fromVec[Axis.Y];
                var tox = dirVec[Axis.X] + fromx, toy = dirVec[Axis.Y] + fromy;
                var angle = Math.atan2(toy-fromy,tox-fromx);
                this.moveTo(fromx, fromy);
                this.lineTo(tox, toy);
                this.lineTo(tox-headLen*Math.cos(angle-Math.PI/6),toy-headLen*Math.sin(angle-Math.PI/6));
                this.moveTo(tox, toy);
                this.lineTo(tox-headLen*Math.cos(angle+Math.PI/6),toy-headLen*Math.sin(angle+Math.PI/6));
                this.stroke();
            },
        });

        return context;
    };


    // #######################################################################################################################
    // UI settings & SimplePlatformerUI Class

    /**
     * @const
     */
    var gameContainerCSS = {
        "position": "absolute",
        "left": "0px",
        "right": "0px",
        "bottom": "0px",
        "width": "100%",
        "height": "100%",
        "margin": "0px",
        "padding": "0px",

        "background-color": "red"
    };
    
    /**
     * @const
     */
    var canvasCSS = {
        "position": "relative",  // see: http://stackoverflow.com/a/3274697/2228771
        "display": "block", // fixes white overhanging area - see: http://stackoverflow.com/questions/18804858/how-do-i-fix-the-overhanging-blank-area-on-an-image-using-in-html
        "left": "0px",
        "right": "0px",
        "top": "0px",
        "bottom": "0px",
        "width": "100%",
        "height": "100%",
        "margin": "0px",
        "padding": "0px",

        "background-color": "grey"
    };

    /**
     * @const
     */
    var textContCSS = {
        "position": "absolute",
        "left": "0px",
        "top": "0px",
        "margin": "0px",
        "padding": "0px",
        "width": "100%",
        "height": "40px",
        "background-color": "rgba(30,180,30,0.1)",
        "z-index": 10
    };

    /**
     * @const
     */
    var textCSS = {
        "margin": "0px",
        "padding": "6px",
        "font-size": "1.5em",
        "z-index": 20
    };

    /**
     * Graphical User Interface for SimplePlatformerGame.
     * @constructor
     */
    var SimplePlatformerUI = squishy.createClass(
        function (containerEl, DebugDrawEnabled, game) {
            // set object properties
            this.containerEl = containerEl;
            this.DebugDrawEnabled = DebugDrawEnabled;
            this.game = game;
            this.world = game.world;
            this.selected = {};

            // setup everything
            this.registerEventListeners();
            this.setupUI();

            // start render loop
            this.requestRendering();
        }, {
            // ###################################################################################################
            // UI Setup

            /**
             * @sealed
             */
            setupUI: function () {
                // style game container
                this.containerEl.css(gameContainerCSS);

                // create, style and append canvas
                var canvas = this.canvas = $("<canvas></canvas>");
                canvas.css(canvasCSS);
                this.containerEl.append(canvas);

                // HTML elements need tabindex to be focusable (see: http://stackoverflow.com/questions/5965924/jquery-focus-to-div-is-not-working)
                canvas.attr("tabindex", 0);

                // create, style and append text box
                var textCont = this.textCont = $("<div>");
                textCont.css(textContCSS);
                this.containerEl.append(textCont);
                var text = this.text = $("<pre>hi</pre>");
                text.css(textCSS);
                textCont.append(text);

                var canvasDOM = this.canvas[0];
                
                this.viewport = new AABB([0, 0], [canvasDOM.width, canvasDOM.height]);
                
                var fixAspectRatio = function() {
                    // This function resets the aspect ratio.
                    // If this function is not called, the canvas transformation will stay the same, 
                    // and the canvas contents will stretch to fit to the container, thereby ruining the aspect ratio.
                    // Sadly, setting canvas width or height resets the entire context.
                    // So we have to re-initialize everything.
                    canvasDOM.width = canvas.innerWidth();
                    canvasDOM.height = canvas.innerHeight();
                    
                    context.onResetTransform();
                    
                    // flip the y-axis, so y points up (as in regular physics)
                    context.scale(1, -1);
                    context.translate(0, -canvasDOM.height);
                    
                    vec2.SetXY(this.viewport.min, 0, 0);
                    vec2.SetXY(this.viewport.max, canvasDOM.width, canvasDOM.height);
                }.bind(this);

                // enhance canvas context functionality
                var context = canvasDOM.getContext('2d');
                enhanceCanvas(canvasDOM);       // keep track of transformation matrix, and some other goodies...
                
                fixAspectRatio();
                
                // always keep the same aspect ratio
                $(window).resize(function() {
                    fixAspectRatio();
                    this.requestRendering();       // request a re-draw, in case rendering loop is not active
                }.bind(this));

                // mouse interaction
                this.cursorClient = vec2.create();
                this.cursorWorld = vec2.create();
                canvas.mousemove(function (event) {
                    // update mouse coordinates
                    vec2.SetXY(this.cursorClient, event.clientX, event.clientY);
                    this.onCursorMove();
                }.bind(this));
                squishy.onClick(canvasDOM, function(event) {
                    this.onTouch();
                }.bind(this));

                // keep track of transformation changes

                //context.translate(w, h);
                //context.rotate(Math.PI);                          // turn context up-side-down, so y axis is pointing up
            },
            
            
            // ###################################################################################################
            // Rendering
            
            /**
             * Request _render to be called again soon.
             */
            requestRendering: function() {
                if (!this.renderTimer) this.renderTimer = requestAnimationFrame(this._render.bind(this));
            },

            _render: function (timestamp) {
                this.translate([1,0]);
                
                // re-draw all objects
                var canvasDOM = this.canvas[0];
                var context = canvasDOM.getContext('2d');
                
                // clear background (using the CSS background-color property)
                var w = canvasDOM.width;
                var h = canvasDOM.height;
                context.clearRect(0, 0, w, h);

                var tmp = vec2.create();
                
                // TODO: Kd-tree, BVI etc for faster finding of rendered objects
                for (var objId in this.world.objects) {
                    if (!this.world.objects.hasOwnProperty(objId)) continue;
                    var obj = this.world.objects[objId];
                    // TODO: Check if object intersects with viewport
                    var shape = obj.getShape();
                    var shapeType = shape.getShapeType();
                    switch (shapeType) {
                        case ShapeType.AABB:
                            this._renderAABB(context, tmp, obj, shape);
                            if (this.DebugDrawEnabled) {
                                this._debugDrawAABB(context, tmp, obj, shape);
                            }
                            break;
                        default:
                            throw new Error("Shape not yet supported: " + ShapeTypes.toString(shapeType));
                    }
                }

                this.renderTimer = null;
                this.requestRendering();
            },
            
            /**
             * Render an AABB shape.
             */
            _renderAABB: function(context, from, obj, shape) {
                vec2.Set(from, obj.position);
                vec2.Add(from, shape.min);

                // draw filled rectangle with a border
                // see http://www.html5canvastutorials.com/tutorials/html5-canvas-rectangles/

                context.beginPath();
                context.fillStyle = '#4444EE';
                context.fillRect(from[Axis.X], from[Axis.Y], shape.dimensions[Axis.X], shape.dimensions[Axis.Y]);
                // context.strokeStyle = '#4444CC';        // dark blue
                // context.stroke();
            },
            
            /**
             * Visualize stuff for debugging physics.
             */
            _debugDrawAABB: function(context, from, obj, shape) {
                context.lineWidth = 1.5;
                context.strokeStyle = '#AA1111';        // dark red
                
                if (this.isSelected(obj)) {
                    // draw selection
                    context.beginPath();
                    context.fillStyle = '#AA4444';
                    context.strokeRect(from[Axis.X], from[Axis.Y], shape.dimensions[Axis.X], shape.dimensions[Axis.Y]);
                }
                    
                // draw surface normals
                shape.getSurfaces().forEach(function(line) {
                    var normal = vec2.MulSGet(line.normal, 10);
                    from = vec2.AddGet(obj.position, line.from);
                    var from = vec2.AddGet(from, vec2.MulSGet(line.delta, .5));
                    context.drawArrow(from, normal, 5);
                });
            },
            
            
            // ###################################################################################################
            // Event listeners
        
            /**
             * Register world event listeners.
             * @sealed
             */
            registerEventListeners: function () {
                // none needed yet
            },
            
            /**
             * Called everytime the viewport changed.
             */
            onViewportChanged: function() {
                this.world2ClientMatrix = this.getContext().getMatrix();
                this.client2WorldMatrix = this.getContext().getInverseMatrix();
            
                // re-compute viewport aabb
                vec2.SetXY(this.viewport.max, 0, 0);
                vec2.SetXY(this.viewport.max, this.canvas.width, this.canvas.height);
                this.transformClientToWorld(this.viewport.min);
                this.transformClientToWorld(this.viewport.max);
            
                // cursor moved (relative to world)
                this.onCursorMove();
            },
            
            /**
             * Mouse movement relative to world.
             * Note that moving the viewport also moves the mouse relative to the world.
             */
            onCursorMove: function() {
                vec2.Set(this.cursorWorld, this.cursorClient);
                this.transformClientToWorld(this.cursorWorld);
                
                // display mouse world coordinates
                this.text.text("Mouse: " + this.cursorWorld);
            },
            
            /**
             * Select objects
             */
            onTouch: function() {
                var coords = this.cursorWorld;
                this.world.foreachObjectAtPoint(coords, function(obj) {
                    this.selectObject(obj);
                }.bind(this));
            },
            
        
            // ###################################################################################################
            // Manage UI
            
            getContext: function() { return this.canvas[0].getContext('2d'); },
            
            /**
             * Convert client (e.g. mouse or touch) coordinates to world coordinates.
             * Result will be stored in the given client coordinates vector.
             */
            transformClientToWorld: function(vec) {
                MVMulSVG(this.client2WorldMatrix, vec);
            },
            transformWorldToClient: function(vec) {
                MVMulSVG(this.world2ClientMatrix, vec);
            },
            
            /**
             * Translates the viewport by the given 2D vector.
             */
            translate: function(vec) {
                squishy.assert(vec && vec.length && vec.length == 2, "vec must be an array of length 2, representing x and y components.");
                this.getContext().translate(-vec[0], -vec[1]);
                this.onViewportChanged();
            },
            
            /**
             * Scales the viewport by the given 2D vector.
             */
            scale: function(vec) {
                squishy.assert(vec && vec.length && vec.length == 2, "vec must be an array of length 2, representing x and y components.");
                this.getContext().scale(1/vec[0], 1/vec[1]);
                this.onViewportChanged();
            },
            
        
            // ###################################################################################################
            // Objects in UI
            
            _checkObjectOrObjectId: function(objectOrObjectId) {
                var obj;
                if (objectOrObjectId instanceof RigidBody) obj = objectOrObjectId;
                else obj = this.world[objectOrObjectId];
                if (!obj) throw new Error("objectOrObjectId is invalid.");
                return obj;
            },
            
            /**
             * Whether the given object is selected.
             */
            isSelected: function(objectOrObjectId) {
                var obj = this._checkObjectOrObjectId(objectOrObjectId);
                return !!this.selected[obj.objectId];
            },
            
            /**
             * Toggle, select or deselect object (to force select or deselect, use second parameter; else selection is toggled).
             * @param {} objectOrObjectId The object to be selected or deselected, or it's objectId.
             * @param {Bool} forceSelect If true, will either select object or do nothing (if already selected). If false, will either deselect object or do nothing.
             */
            selectObject: function(objectOrObjectId, forceSelect) {
                var obj = this._checkObjectOrObjectId(objectOrObjectId);
                var isSelected = this.selected[obj.objectId];
                if (!squishy.isDefined(forceSelect)) forceSelect = !isSelected;
                if (isSelected == forceSelect) {
                    return;     // nothing to do
                }
                
                if (forceSelect) {
                    // select
                    this.selected[obj.objectId] = obj;
                }
                else {
                    // de-select
                    delete this.selected[obj.objectId];
                }
                
                this.requestRendering();    // things changed, so we need to re-render
                
                // TODO: Raise event
            }
            
        }
    );


    // #######################################################################################################################
    // Setup a simple world & start UI

    // setup world configuration
    var worldSize = 1000;
    var gameCfg = {
        
    };
    var worldCfg = {
        dt: 60,
        gravity: vec2.fromValues(1, 0),
        worldBox: new AABB([0, 0], [worldSize, worldSize])
    };

    var game = new SimplePlatformerGame(gameCfg, worldCfg);

    // creates a static box object
    var AddBox = function (x, y, w, h) {
        var def = {
            position: [x, y],
            shape: new AABBShape([0, 0], [w, h])
        };

        var obj = new RigidBody(def);
        game.world.addObject(obj);
        return obj;
    };

    AddBox(10, 10, 100, 10);
    AddBox(10, 190, 50, 10);
    AddBox(400, 600, 30, 10);

    // start UI
    $("body").css("top", "10px");
    var gameEl = $("#game");
    var gameUI = new SimplePlatformerUI(gameEl, true, game);
});