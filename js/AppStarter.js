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
    "Squishy",
    "localizer",
    "Lib/GameAI"
    //"Lib/CodeContracts"
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
     * Defines all currently implemented types of objects.
     * @const
     */
    var ObjectType = squishy.makeFlagEnum([
        "RigidBody", "Movable", "Agent"
    ]);

    /**
     * Simple AABB storage class.
     * @constructor
     */
    var AABB = squishy.createClass(
        function(min, max) {
            this.min = min;
            this.max = max;
            this.dimensions = vec2.subtract(vec2.create(), max, min);
        },{
            getArea: function () {
                return this.dimensions[Axis.X] * this.dimensions[Axis.Y];
            },
        }
    );
    
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
            this._super();
            
            if (!dontNormalizeNormal) {
                vec2.normalize(normal, normal);
            }
            
            this.from = from;
            this.to = to;
            this.normal = normal;
            this.delta = vec2.subtract(vec2.create(), this.to, this.from);        // the vector pointing from "from" to "to"
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
            //getVertices: squishy.abstractMethod(),      // currently, collision detection only works with linearized surfaces
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
            this._super();
        
            this.min = minVertex;
            this.max = maxVertex;
            this.dimensions = vec2.subtract(vec2.create(), this.max, this.min);
            
            // build line segments to outline the box
            var a = this.min;
            var b = vec2.clone(this.min);
            b[Axis.X] = this.max[Axis.X];
            var c = this.max;
            var d = vec2.clone(this.min);
            d[Axis.Y] = this.max[Axis.Y];
            
            this.vertices = [a, b, c, d];
            this.center = vec2.create();
            vec2.scale(this.center, vec2.add(this.center, this.min, this.max), .5);      // center = (min + max)/2
            
            this.surfaces = [];
            this.surfaces.push(new LineSegment(d, a, vec2.subtract(vec2.create(), d, c)));  // minX
            this.surfaces.push(new LineSegment(a, b, vec2.subtract(vec2.create(), a, d)));  // minY
            this.surfaces.push(new LineSegment(b, c, vec2.subtract(vec2.create(), b, a)));  // maxX
            this.surfaces.push(new LineSegment(c, d, vec2.subtract(vec2.create(), c, b)));  // maxY
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
            },
                
            /**
             * Every surface of an AABB can be described by knowing on which axis (x or y)
             * and knowing whether it is the min or max of the two.
             */
            getSide: function(xAxis, minSide) {
                var index = xAxis + (minSide * 2);
                return this.surfaces[index];
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

            // objects must have a position, shape and stepHeight
            squishy.assert(vec2.isValid(this.position), "position is invalid.");
            squishy.assert(this.shape, "shape was not defined.");
            
            this.stepHeight = this.stepHeight || vec2.fromValues(0, 0); // cannot move over any obstacles
        }, {
            // methods
            getObjectType: function() { return ObjectType.RigidBody; },
            
            isObjectType: function(objectType) { return this.getObjectType() & objectType; },
            
            getShape: function () { return this.shape; },

            /**
             * Static objects or agents without health are dead.
             */
            isAlive: function () { return this.health > 0; },

            /**
             * Currently, only living agents can move.
             */
            canMove: function () { return false; },
            
            /**
             * Test whether this object contains the given point in world coordinates.
             */
            containsPoint: function(worldPoint) {
                // Transform to object-local coordinate system.
                // Currently, only translations are supported, so a change of coordinate systems can only change the origin.
                var localPoint = vec2.subtract(worldPoint, worldPoint, this.position);
                return this.shape.containsPoint(localPoint);
            },
            
            toString: function() { return this.objectId; }
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
            this._super(objectDefinition);

            // movables have velocity and acceleration
            if (!vec2.isValid(this.velocity)) {
                this.velocity = vec2.create();
            }
            if (!vec2.isValid(this.acceleration)) {
                this.acceleration = vec2.create();
            }
            
            this.onGround = false;
            this.lastGroundIteration = 0;
            this.lastPositionDelta = vec2.create();
        }, {
            // methods

            getObjectType: function() { return ObjectType.RigidBody | ObjectType.Movable; },
            
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
                return !this.onGround;
            },

            /**
             * Movable just hit the ground.
             */
            onHitGround: function () {
                this.onGround = true;
            },
            
            /**
             * Movable just took off from the ground
             */
            onLeftGround: function() {
                this.onGround = false;
            },
            
            onStep: function(dt) {},
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
            this._super(objectDefinition);
            
            // check configuration options
            /**
             * Horizontal speed when moving left and right on the ground.
             */
            this.groundControlSpeed = this.groundControlSpeed || 30;
            
            /**
             * How much of the ground speed one gets when mid-air (in the real world, this is 0, unless you have a jetpack, or other propulsion methods).
             */
            this.airControlRatio = this.airControlRatio || 1;
            
            /**
             * Vertical initial speed when jumping.
             */
            this.jumpSpeed = this.jumpSpeed || 500;

            // agents start alive
            squishy.assert(this.maxHealth > 0);
            this.health = this.maxHealth;
            
            // intermediate variable
            this.controlSpeed = 0;
        }, {
            // methods

            getObjectType: function() { return ObjectType.RigidBody | ObjectType.Movable | ObjectType.Agent; },
            
            /**
             * Wether this is an agent. Agents can move and die.
             */
            isAgent: function () {
                return true;
            },


            // Agent actions
            getCurrentControlSpeed: function() {
                return this.isFalling() ? this.groundControlSpeed * this.airControlRatio : this.groundControlSpeed;
            },

            /**
             * Let this agent perform the given physical action.
             */
            performAction: function (action) {
                switch (action) {
                case (AgentAction.startMoveLeft):
                    this.controlSpeed = -this.getCurrentControlSpeed();
                    break;
                case (AgentAction.startMoveRight):
                    this.controlSpeed = this.getCurrentControlSpeed();
                    break;
                case (AgentAction.stopMove):
                    this.controlSpeed = 0;
                    break;
                case (AgentAction.jump):
                    if (!this.isFalling()) {
                        this.velocity[Axis.Y] = this.jumpSpeed;
                    }
                    break;
                }
            },
            
            onStep: function(dt) {
                this.velocity[Axis.X] = this.controlSpeed;
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
    
    
    /**
     * Represents a collision between two AABBs.
     * @constructor
     */
    var CollisionPair = squishy.createClass(
        function() {
        },{
            setObjects: function(obj1, obj2) {
                this.obj1 = obj1;
                this.obj2 = obj2;
                this.penetration = vec2.create();
            },
            
            refresh: function(currentIteration) {
                this.lastActiveIteration = currentIteration;
            }
        }
    );
    
    /**
     * Stores collision pairs and avoids duplicate reporting.
     * Also provides a pool for CollisionPair objects to reduce GC intervention.
     * @constructor
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
            compareObjects: function(obj1, obj2) {
                var isObj1Movable = obj1.isObjectType(ObjectType.Movable);
                var isObj2Movable = obj2.isObjectType(ObjectType.Movable);
                if (isObj1Movable == isObj2Movable) {
                    // same type -> sort by ID
                    return obj1.objectId - obj2.objectId > 0;
                }
                // movable objects are "greater than" non-movable ones.
                return isObj1Movable ? true : false;
            },
            
            addPair: function(obj1, obj2) {
                // in order to identify this pair, we need to establish an order between the two objects
                if (!this.compareObjects(obj1, obj2)) {
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
                var obj1CollisionList = this.pairs[obj1.objectId];
                if (!obj1CollisionList) {
                    obj1CollisionList = this.pairs[obj1.objectId] = {};
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
                
                pair.refresh(this.currentIteration);
                return pair;
            },
            
            callForEachPair: function(onNewCollision, onContactGone, thisArg) {
                for (var obj1Id in this.pairs) {
                    var pairList = this.pairs[obj1Id];
                    for (var obj2Id in pairList) {
                        var pair = pairList[obj2Id];
                        var d = this.currentIteration - pair.lastActiveIteration;
                        if (d == 0) {
                            // if this collision is still active, go for it
                            onNewCollision.call(thisArg, pair);
                        }
                        else if (d == 1) {
                            // this collision was active last round, but not active anymore, so contact was broken
                            onContactGone.call(thisArg, pair);
                        }
                    }
                }
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
     */
    var SimplePlatformerWorld = squishy.createClass(
        function (config) {
            config.Dt = config.Dt || .06;            // set default dt
            
            // check parameter validity
            squishy.assert(config, "config is undefined");
            squishy.assert(config.Dt > 0, "config.Dt is invalid"); // must be positive
            squishy.assert(vec2.isValid(config.Gravity));
            squishy.assert(config.WorldBox && config.WorldBox.getArea() > 0, "config.WorldBox is invalid");

            this.lastObjectId = 0; // running id for new objects
            this.currentIteration = 1;

            // assign properties
            this.config = config;

            // keep track of all objects (including movables), all movables, all current collisions
            this.objects = {};
            this.movables = {};
            this.collisions = new CollisionList();

            // create all world events
            this.events = {
                /**
                 * Game just started. // args = configuration + all initially visible objects.
                 */
                start: squishy.createEvent(this),
                
                /**
                 * Game is about to stop. // args = configuration + all initially visible objects.
                 */
                stopping: squishy.createEvent(this),

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
                if (obj.isObjectType(ObjectType.Movable)) {
                    this.movables[obj.objectId] = obj;
                }
                
                console.log("Added object #" + obj.objectId + " of type: " + obj.getObjectType());

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
                if (obj.isObjectType(ObjectType.Movable)) {
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
             * Start or stop running.
             */
            startStopLoop: function(dt) {
                if (this.loopTimer) this.stopLoop();
                else this.startLoop();
            },
            
            startLoop: function(dt) {
                if (this.loopTimer) return;
                //this.loopTimer = setInterval(this.step.bind(this), dt);
                this.loopTimer = setInterval(this.step.bind(this), dt * 1000);
            },
            
            stopLoop: function(dt) {
                if (!this.loopTimer) return;
                clearInterval(this.loopTimer);
                this.loopTimer = null;
            },

            /**
             * Advance step by given amount of time. Uses config.Dt, if dt is not given.
             */
            step: function (dt) {
                // TODO: Compute actual dt
                dt = dt || this.config.Dt;

                // update velocity and position
                this.integrateStep(dt);

                // detect collisions
                this.collisions.setCurrentIteration(++this.currentIteration);
                for (var objId in this.movables) {
                    if (!this.movables.hasOwnProperty(objId)) continue;
                    this.detectCollisions(this.movables[objId]);
                }

                // resolve collisions
                this.collisions.callForEachPair(this.onNewCollision, this.onContactGone, this);

                // run event listeners
                this.events.step.fire(dt);
            },
            
            _totalAcceleration: vec2.create(),
            
            /**
             * Compute new linear velocities and positions.
             */
            integrateStep: function (dt) {
                // Linear integration: We do not support angular velocity or rotation, which makes things a whole lot easier.
                // We first integrate acceleration to update velocity, then integrate velocity to get new position.
                // This is called semi-implicit Euler integration: It is fast, simple and inaccurate (but good enough for linear integration in games).
                squishy.forEachOwnProp(this.movables, function (objId, obj) {
                    obj.onStep(dt);
                
                    vec2.add(this._totalAcceleration, obj.acceleration, this.config.Gravity);               // add gravity
                    
                    vec2.scaleAndAdd(obj.velocity, obj.velocity, this._totalAcceleration, dt);              // update velocity
                    
                    
                    vec2.scale(obj.lastPositionDelta, obj.velocity, dt);
                    
                    // add step height, so object can just "float" over small obstacles and walk up stairs
                    if (!obj.isFalling()) {
                        vec2.add(obj.position, obj.position, obj.stepHeight);
                        vec2.subtract(obj.lastPositionDelta, obj.lastPositionDelta, obj.stepHeight); 
                    }
                    vec2.add(obj.position, obj.position, obj.lastPositionDelta);                 // update position
                }, this);
            },
            
            /**
             * Detects all collision between the given movable and all potential collision candidates.
             */
            detectCollisions: function (movable) {
                // TODO: Build kd-tree, BVI or other accelerating data structure to minimize collision search space
                // check against every other possibly colliding object
                var shape1 = movable.shape;
                var pos1 = movable.position;
                var dim1 = shape1.dimensions;
                
                // TODO: Get rid of pre-allocated temps
                var center1 = vec2.copy(vec2.createTemp(), shape1.center);
                var penetration = vec2.createTemp();
                
                // transform to world coordinates
                vec2.add(center1, center1, pos1);
                
                for (var objectId in this.objects) {
                    if (!this.objects.hasOwnProperty(objectId)) continue;
                    if (movable.objectId == objectId) continue; // don't check intersection with itself (bodies are assumed to be rigid)
                    var obj = this.objects[objectId];
                    
                    // TODO: Create map of shape<->shape collision algorithms and move this code out of here
                    var shape2 = obj.shape;
                    var pos2 = obj.position;
                    var dim2 = shape2.dimensions;
                    var center2 = shape2.center;
                    squishy.assert(shape1.getShapeType() == ShapeType.AABB && shape2.getShapeType() == ShapeType.AABB, "Currently, only AABB<->AABB collision detection is supported");
                    
                    // transform into obj coordinates
                    vec2.subtract(center1, center1, pos2);
                    
                    // we have a collision if: |center1 - center2| <= (dimensions1 + dimensions2)/2
                    // same as: |center1 - center2| - dimensions1/2 - dimensions2/2 <= 0
                    vec2.abs(penetration, vec2.subtract(penetration, center1, center2));
                    vec2.scaleAndSubtract(penetration, penetration, dim1, .5);
                    vec2.scaleAndSubtract(penetration, penetration, dim2, .5);
                    
                    if (penetration[0] < 0 && penetration[1] < 0) {
                        // collision detected
                        // add new collision pair, if it does not exist yet
                        var pair = this.collisions.addPair(movable, obj);
                        
                        vec2.copy(pair.penetration, penetration);     // remember penetration value
                    }
                                        
                    // Transform back into world coordinates
                    vec2.add(center1, center1, pos2);
                    
                    
                    //var vertices = obj.getVertices();
                    
                    //    collisions.addPair(movable, obj);
                }
            },
            
            /**
             * Makes sure (optimistically) that the given pair does not intersect anymore after call, or very soon in the future.
             * TODO: Support 
             */
            onNewCollision: function(pair) {
                var obj1 = pair.obj1;
                var obj2 = pair.obj2;
                var penetration = pair.penetration
                var shape1 = obj1.shape;
                var shape2 = obj2.shape;
                var pos1 = obj1.position;
                var pos2 = obj2.position;
                
                squishy.assert(shape1.getShapeType() == ShapeType.AABB && shape2.getShapeType() == ShapeType.AABB, "Currently, only AABB<->AABB collision detection is supported");
                
                // continuous collision detection:
                
                // start by computing the competing vertices
                var delta = obj1.lastPositionDelta;
                var dx = delta[Axis.X];
                var dy = delta[Axis.Y];
                
                // check vertical surfaces for collision
                var x1 = 0, x2 = 0;
                if (dx > 0) {
                    // we are moving forward: check maxX1 against minX2
                    x1 = shape1.max[Axis.X];
                    x2 = shape2.min[Axis.X];
                }
                else {
                    // we are moving backward: check minX1 against maxX2
                    x1 = shape1.min[Axis.X];
                    x2 = shape2.max[Axis.X];
                }
                
                // check horizontal surfaces for collision
                var y1 = 0, y2 = 0;
                var down;
                if (dy > 0) {
                    // we are moving up: check maxY1 against minY2
                    y1 = shape1.max[Axis.Y];
                    y2 = shape2.min[Axis.Y];
                    down = false;
                }
                else {
                    // we are moving down: check minY1 against maxY2
                    y1 = shape1.min[Axis.Y];
                    y2 = shape2.max[Axis.Y];
                    down = true;
                }
                
                // transform obj1's coordinates into obj2's coordinate system
                var xTransform = pos1[Axis.X] - pos2[Axis.X];
                var yTransform = pos1[Axis.Y] - pos2[Axis.Y];
                x1 += xTransform;
                y1 += yTransform;
                
                // check against horizontal and vertical surfaces, and take the shorter route:
                var tx = (x1-x2)/delta[Axis.X];      // bump against vertical surface
                var ty = (y1-y2)/delta[Axis.Y];      // bump against horizontal surface
                
                var bumpAxis = tx < ty && dx > 0 ? Axis.X : Axis.Y;        // determine in which direction motion was stopped abruptly
                var t = bumpAxis == Axis.X ? tx : ty;
                if (!isFinite(t)) return;       // no real collision
                
                squishy.assert(t >= 0 && t <= 1, "Collision resolution bug: " + y1 + ", " + y2);
                
                // snap back to surface and set velocity to 0:
                obj1.position[bumpAxis] -= t * delta[bumpAxis];
                obj1.velocity[bumpAxis] = 0;        // make sure, it stops "running against the wall", at least for now
                
                //pair.surface1 = shape1.getSide(bumpAxis, isMin);
                
                if (down && bumpAxis == Axis.Y) {
                    // object hit the "ground"
                    pair.isGroundCollision = true;
                    if (this.currentIteration - obj1.lastGroundIteration > 1) {
                        // object was not on ground in the last iteration
                        obj1.onHitGround();
                    }
                    obj1.lastGroundIteration = this.currentIteration;
                }
                else {
                    // object hit something that is not the ground (probably wall or ceiling)
                    pair.isGroundCollision = false;
                }

                // NOTE: We are assuming that obj1 is a movable and obj2 is not.
                // TODO: For proper Movable<->Movable collision resolution, we need to solve transfer of momentum equation.
                // TODO: Add a second round of collision resolution to check if there are still collisions
                //    -> If there are, use least-movement collision resolution (move by the least distance necessary to move them apart)
                //    -> Repeat a few times
            },
            
            onContactGone: function(pair) {
                if (pair.isGroundCollision && pair.obj1.lastGroundIteration != this.currentIteration) {
                    // lost contact with the ground (object underneath)
                    pair.obj1.onLeftGround();
                }
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

            translate: function (dx, dy) {
                if (dx == 0 && dy == 0) return;
                this._matrix = this._matrix.translate(dx, dy);
                super_.translate.call(this, dx, dy);
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
    // Commands have a name, description and a callback
    
    // TODO: Localization of names and descriptions
    // TODO: Proper parameter support for commands
    
    /**
     * @constructor
     */
    var Command = squishy.createClass(
        function (def) {
            squishy.assert(def.name);
            squishy.assert(def.callback);
            
            this.name = def.name;
            this.prettyName = def.prettyName || def.name;
            this.callback = def.callback;
            this.description = def.description || "";
        },{
            // prototype
            setOwner: function(owner) { this.owner = owner; },
            run: function() {
                squishy.assert(this.owner, "You forgot to call UICommand.setOwner or Command.createCommandMap.");
                this.callback.apply(this.owner, arguments);  // call call back on UI object with all arguments passed as-is
            }
        }
    );
    
    /**
     * Takes the owner of all commands, their definitions and 
     * returns a new map of Command objects.
     */
    Command.createCommandMap = function(owner, commandDefinitions) {
        var map = {};
        squishy.forEachOwnProp(commandDefinitions, function(name, def) {
            def.name = name;
            var cmd = new Command(def);
            cmd.setOwner(owner);
            map[name] = cmd;
        });
        return map;
    };
    
    if ($) {
        // if there is a UI (and jQuery support), we also want to append the commands to the toolbar
        Command.addCommandsToToolbar = function(commandMap, toolbar, buttonCSS) {
            squishy.forEachOwnProp(commandMap, function(name, cmd) {
                var button = $("<button>");
                button.text(cmd.prettyName);
                button.css(buttonCSS);
                button.click(function(evt) { cmd.run(); });     // currently, can only run commands without arguments here
                toolbar.append(button);
            });
        };
    }


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
    
    var toolbarCSS = {
        "position": "absolute",
        "top": "0px",
        "left": "0px",
        "margin": "0px",
        "padding": "0px",
        "width": "100%",
        "background-color": "rgba(30,180,30,0.1)",
        "z-index": 10
    };

    /**
     * @const
     */
    var toolbarElCSS = {
        "float": "left",
        "margin": "0px",
        "padding": "6px",
        "font-size": "1.2em",
        "z-index": 22
    };

    /**
     * Graphical User Interface for SimplePlatformerGame.
     * @constructor
     */
    var SimplePlatformerUI = squishy.createClass(
        function (containerEl, DebugDrawEnabled, game, commandMap) {
            // set object properties
            this.containerEl = containerEl;
            this.DebugDrawEnabled = DebugDrawEnabled;
            this.game = game;
            this.world = game.world;
            this.selected = {};

            // setup everything
            this.commands = commandMap || {};
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

                // create toolbar
                // TODO: Proper toolbar
                var toolbar = this.toolbar = $("<div>");
                toolbar.css(toolbarCSS);
                this.containerEl.append(toolbar);
                
                // add buttons
                Command.addCommandsToToolbar(this.commands, toolbar, toolbarElCSS);
                
                // create, style and append text box
                var text = this.text = $("<pre>hi</pre>");
                text.css(toolbarElCSS);
                toolbar.append(text);

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
                    
                    this.onViewportChanged();
                }.bind(this);

                // enhance canvas context functionality
                var context = canvasDOM.getContext('2d');
                enhanceCanvas(canvasDOM);       // keep track of transformation matrix, and some other goodies...
                
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
                    vec2.set(this.cursorClient, event.clientX, event.clientY);
                    this.onCursorMove();
                }.bind(this));
                squishy.onPress(canvasDOM, function(event) {
                    this.onTouch();
                }.bind(this));
                
                // Make full use of current canvas width and height (by default, it is zoomed to display some 300 x 150 pixels only)
                fixAspectRatio();
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
                //this.translate([1,0]);
                
                // re-draw all objects
                var canvasDOM = this.canvas[0];
                var context = canvasDOM.getContext('2d');
                
                // clear background (using the CSS background-color property)
                var min = this.viewport.min;
                var dim = this.viewport.dimensions;
                context.clearRect(min[Axis.X], min[Axis.Y], canvasDOM.width, canvasDOM.height);

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
                vec2.copy(from, obj.position);
                vec2.add(from, from, shape.min);

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
                    var normal = vec2.scale(vec2.create(), line.normal, 10);
                    vec2.add(from, obj.position, line.from);
                    vec2.scaleAndAdd(from, from, line.delta, .5);
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
                vec2.set(this.viewport.min, 0, 0);
                vec2.set(this.viewport.max, this.canvas[0].width, this.canvas[0].height);
                this.transformClientToWorld(this.viewport.min);
                this.transformClientToWorld(this.viewport.max);
                
                var min = vec2.copy(vec2.create(), this.viewport.min);
                vec2.min(this.viewport.min, this.viewport.max, min);
                vec2.max(this.viewport.max, this.viewport.max, min);
                
                vec2.subtract(this.viewport.dimensions, this.viewport.max, this.viewport.min);
            
                // cursor moved (relative to world)
                this.onCursorMove();
            },
            
            /**
             * Mouse movement relative to world.
             * Note that moving the viewport also moves the mouse relative to the world.
             */
            onCursorMove: function() {
                vec2.copy(this.cursorWorld, this.cursorClient);
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
            translate: function(dx, dy) {
                this.getContext().translate(-dx, -dy);
                this.onViewportChanged();
            },
            
            /**
             * Scales the viewport by the given 2D vector.
             */
            scale: function(dx, dy) {
                this.getContext().scale(1/dx, 1/dy);
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
    
    /** 
     * @const
     */
    var GameConfig = {
    };

    // setup world configuration
    var worldSize = 10000;
    var gameCfg = {
        
    };
    var worldCfg = {
        Dt: .06,
        Gravity: vec2.fromValues(0, -40),
        WorldBox: new AABB([0, 0], [worldSize, worldSize]),
    };

    var game = new SimplePlatformerGame(gameCfg, worldCfg);
    var world = game.world;

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
    
    // creates a simple AABB agent
    var AddAgent = function (x, y, w, h) {
        var def = {
            position: [x, y],
            shape: new AABBShape([0, 0], [w, h]),
            maxHealth: 1,
            
            /**
             * Horizontal speed when moving left and right on the ground.
             */
            groundControlSpeed: 30,
            
            /**
             * How much of the ground speed one gets when mid-air (in the real world, this is 0, unless you have a jetpack, or other propulsion methods).
             */
            airControlRatio: .7,
            
            /**
             * Vertical initial speed when jumping.
             */
            jumpSpeed: 130
        };

        var obj = new Agent(def);
        game.world.addObject(obj);
        return obj;
    };

    // add some static environment
    var box1 = AddBox(0, 0, 1500, 100);
    AddBox(200, 100, 10000, 150);
    
    // add an agent
    var playerAgent = AddAgent(100, 120, 10, 60);
    
    // game controls
    var commandMap = Command.createCommandMap(game.world, {
        startstop: {
            prettyName: "Start/Stop",
            description: "Starts or stops the game.",
            keyboard: "s",
            callback: function() {
                this.startStopLoop();
            }
        },
        steponce: {
            prettyName: "Step Once",
            description: "Takes a single simulation step.",
            keyboard: "o",
            callback: function() {
                this.step();
            }
        }
    });
    
    
    // bind navigation keys
    var down = 0, downLeft = false, downRight = false;
    Mousetrap.bind('left', function(e) {
        if (!downLeft) {
            downLeft = true;
            ++down;
            playerAgent.performAction(AgentAction.startMoveLeft);
        }
    }, 'keydown');
    Mousetrap.bind('right', function(e) {
        if (!downRight) {
            downRight = true;
            ++down;
            playerAgent.performAction(AgentAction.startMoveRight);
        }
    }, 'keydown');
    Mousetrap.bind('up', function(e) {
        playerAgent.performAction(AgentAction.jump);
    }, 'keydown');
    Mousetrap.bind(['left', 'right'], function(e) {
        --down;
        if (down <= 0) {
            down = 0;
            downRight = downLeft = false;
            playerAgent.performAction(AgentAction.stopMove);
        }
    }, 'keyup');
    
    
    // start UI
    $("body").css("top", "10px");
    var gameEl = $("#game");
    var ui = new SimplePlatformerUI(gameEl, true, game, commandMap);
    
    
    // follow agent in UI:
    
    // how much of the viewport width and height we at least want to have to left, right, bottom and top of the agent
    var scrollMargin = .4;  // if this number is .5, the viewport will always be centered on the agent
    var pos = vec2.create();
    var minMargin = vec2.create(), maxMargin = vec2.create();
    var delta = vec2.create();
    world.events.step.addListener(function() {
        var viewport = ui.viewport;
        var vmin = viewport.min, vmax = viewport.max;
        
        vec2.scaleAndAdd(pos, playerAgent.position, playerAgent.shape.center, .5);  // compute center
        
        // compute distance of margins from min x and y
        vec2.scaleAndAdd(minMargin, vmin, viewport.dimensions, scrollMargin);
        
        // compute distance of margins from max x and y
        vec2.scaleAndSubtract(maxMargin, vmax, viewport.dimensions, scrollMargin);
        
        // compute margin penetration
        vec2.subtract(delta, pos, minMargin);       // min margin
        var dx = 0, dy = 0;
        if (delta[Axis.X] < 0) {
            dx = delta[Axis.X];
        }
        if (delta[Axis.Y] < 0) {
            dy = delta[Axis.Y];
        }
        vec2.subtract(delta, pos, maxMargin);       // max margin
        if (delta[Axis.X] > 0) {
            dx = delta[Axis.X];
        }
        if (delta[Axis.Y] > 0) {
            dy = delta[Axis.Y];
        }
        
        //console.log([dx, dy]);
        // move viewport
        ui.translate(dx, dy);
    });

    
    // start game
    world.startLoop();
});