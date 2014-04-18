/**
 * This file loads and starts the game and its UI.
 */
"use strict";

// configure requirejs
require.config({
    baseUrl : "",
    paths : {
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
        jquery: { exports: '$' },
        jquery_ui: { deps: ['jquery'] },
        jquery_ui_layout: { deps: ['jquery', 'jquery_ui'] }
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
    "JS/Vec",
    
    // Other utilities
    "Squishy", "Lib/GameAI",
    "localizer"
];


// load game and initialize UI
require(dependencies, function(jquery, jqueryUI, jqueryUILayout, mousetrap, Vec, squishy) {
    
    
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
    // Shapes
    
    /**
     * Defines all currently implemented shapes.
     * @const
     */
    var ShapeType = squishy.makeEnum([
        "AABB"
    ]);
    
    /**
     * Axis-aligned straight line segment.
     *
     * @constructor
     * @param {Axis} axis
     * @param {Number} normalDirection 1 or -1 (parallel or anti-parallel to the axis)
     * @param {Number} minValue Starting point of the segment, on the given axis.
     * @param {Number} length Length of the segment along the given axis.
     */
    var AALineSurface = squishy.createClass(
        function(axis, normalDirection, minValue, length) {
            this.axis = axis;
            this.normalDirection = normalDirection;
            this.minValue = minValue;
            this.length = length;
        },{
            // methods
            
        }
    );
    
    /**
     * 
     * @constructor
     */
    var AABBShape = squishy.createClass(
        function(minVertex, maxVertex) {
            this.min = minVertex;
            this.max = maxVertex;
            this.dimensions = Vec.SubtractGet(this.max, this.min);
        },{
            // methods
            
            /**
             * Return the type of this shape.
             */
            getShapeType: function() { return ShapeType.AABB; },
            
            /**
             * Width and height of this box.
             */
            getDimensions: function() { return this.dimensions; },
            
            getArea: function() { return this.dimensions[Axis.X] * this.dimensions[Axis.Y]; }
        }
    );
    
     
    // #######################################################################################################################
    // Object class
    
    /**
     * Creates a new world object.
     * @constructor
     */
    var WorldObject = squishy.createClass(
        function(objectDefinition) {
            // copy all parameters into object
            squishy.clone(objectDefinition, false, this);
            
            // objects must have a position and a shape
            squishy.assert(Vec.IsValid(this.position), "position is invalid.");
            squishy.assert(this.shape, "shape was not defined.");
        },{
            // methods
            getShape: function() { return this.shape; },
            
            /**
             * Wether this is an agent. Agents can move and can die.
             */
            isAgent: function() { return false; },
            
            /**
             * Static objects or agents without health are dead.
             */
            isAlive: function() { return this.health > 0; },
            
            /**
             * Currently, only living agents can move.
             */
            canMove: function() { return false; }
        }
    );
    
    
    // #######################################################################################################################
    // Movable class
    
    /**
     * In-world objects that may be moved, and thus have velocity and acceleration.
     *
     * @constructor
     */
    var Movable = squishy.extendClass(WorldObject,
        function(objectDefinition) {
            this._base(objectDefinition);
            
            // movables have velocity and acceleration
            squishy.assert(Vec.isValid(this.velocity), "velocity is invalid.");
            squishy.assert(Vec.isValid(this.acceleration), "acceleration is invalid.");
            
        },{
            // methods
            
            /**
             * Wether this is an agent. Agents can move and die.
             */
            canMove: function() { return true; },
            
            /**
             * Whether this object is currently not touching ground.
             */
            isFalling: function() { return falling; }
            
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
        function(objectDefinition) {
            this._base(objectDefinition);
            
            // agents start alive
            squishy.assert(this.maxHealth > 0);
            this.health = objectDefinition.maxHealth;            
        },{
            // methods
            
            /**
             * Wether this is an agent. Agents can move and die.
             */
            isAgent: function() { return true; },
            
            
            // Agent actions
            
            /**
             * 
             */
            jump: function() {
                squishy.assert(this.canMove(), "Immovable object is trying to jump: " + this);
            },
            
            /**
             * Let this agent perform the given action.
             */
            performAction: function(action) {
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
    // World class
    
    /**
     * Creates a new Platformer world.
     * @constructor
     * @param {b2AABB} worldBox Defines the bounds of the world.
     */
    var SimplePlatformerWorld = squishy.createClass(
        function(config) {
            // check parameter validity
            squishy.assert(config, "config is undefined");
            squishy.assert(config.dt > 0, "config.dt is invalid");      // must be positive
            squishy.assert(Vec.IsValid(config.gravity));
            squishy.assert(config.worldBox && config.worldBox.getArea() > 0, "config.worldBox is invalid");
           
            this.lastObjectId = 0;      // running id for new objects
            
            // assign properties
            this.config = config;
            
            // create set of all objects & movables in this world
            this.objects = {};
            this.movables = {};
            
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
        },{
            // methods
            
            /**
             * Adds the given object to the world.
             */
            addObject: function(obj) {
                // assign id to object, if it does not exist yet
                obj.objectId = obj.objectId || ++this.lastObjectId;
                
                // make sure, objects cannot be added twice
                squishy.assert(!this.objects[obj.objectId], "Object was added twice: " + obj);
                
                // add object
                this.objects[obj.objectId] = obj;
                if (obj.canMove()) {
                    this.movables[obj.objectId] = obj;
                }
                
                // fire event
                this.events.objectAdded.fire(obj);
            },
            
            /**
             * Removes the given object from the world
             */
            removeObject: function(obj) {
                // fire event
                this.events.objectGone.fire(obj);
                
                // delete
                delete this.objects[obj.objectId];
                if (obj.canMove()) {
                    delete this.movables[obj.objectId];
                }
            },
            
            
            
            // ####################################################################################
            // World physics simulation
            
            /**
             * Advance step by given amount of time. Uses config.dt if dt is not given.
             */
            step: function(dt) {
                dt = dt || this.config.dt;
                
                // semi-Euler integration
                this.integrateStep();
                
                // detect collisions
                
                
                // resolve collisions
                
                // run event listeners
                this.events.step.fire(dt);
            },
            
            /**
             * Compute new velocities and positions.
             */
            integrateStep: function(dt) {
                 // We first integrate acceleration to update velocity, then integrate velocity to get new position.
                 // This is called semi-implicit Euler integration: It is fast, simple and inaccurate (but good enough for linear integration in games).
                 squishy.forEachOwnProp(this.movables, function(objId, obj) {
                    Vec.Add(obj.velocity, Vec.MulS(obj.acceleration, dt));
                    Vec.Add(obj.position, Vec.MulS(obj.velocity, dt));
                 });
            }
        }
    );
    
    
    // #######################################################################################################################
    // UI settings & SimplePlatformerUI Class
    
    /**
     * @const
     */
    var gameContainerCSS = {
        "position": "absolute",
        "left": "0px",
        "right": "0px",
        "top": "0px",
        "bottom": "0px",
        "width": "100%",
        "height": "100%",
        
        "background-color": "red"
    };
    
    var SimplePlatformerUI = squishy.createClass(
        function(containerEl, world) {
            this.containerEl = containerEl;
            this.world = world;
            
            // setup everything
            this.registerEventListeners();
            this.setupUI();
            
            // start render loop
            this.renderTimer = requestAnimationFrame(this.render.bind(this));
        },{
            /**
             * Register world event listeners.
             * @sealed
             */
            registerEventListeners: function() {
                this.world.events.step.addListener(function() {
                }.bind(this));
            },
            
            /**
             * @sealed
             */
            setupUI: function() {
                this.containerEl.css(gameContainerCSS);
                var canvas = this.canvas = $("<canvas></canvas>");
                this.containerEl.append(canvas);
                canvas.css(gameContainerCSS);
                canvas.css("background-color", "grey");
                
                var w = this.containerEl.innerWidth();
                var h = this.containerEl.innerHeight();
                this.canvas[0].width = this.world.config.worldBox.dimensions[0];
                this.canvas[0].height = this.world.config.worldBox.dimensions[1];
            },
            
            render: function(timestamp) {
                // re-draw all objects
                var canvas = this.canvas[0];
                var context = canvas.getContext('2d');
                var w = canvas.width;
                var h = canvas.height;
                context.clearRect(0, 0, w, h);
                
                var min = Vec.Zero();
                squishy.forEachOwnProp(this.world.objects, function(objId, obj) {
                    var shape = obj.getShape();
                    var shapeType = shape.getShapeType();
                    Vec.Set(min, obj.position);
                    switch (shapeType) {
                        case ShapeType.AABB:
                            Vec.Add(min, shape.min);
                        
                            // draw filled rectangle with a border
                            // see http://www.html5canvastutorials.com/tutorials/html5-canvas-rectangles/
                            context.beginPath();
                            context.rect(min[Axis.X], min[Axis.Y], shape.dimensions[Axis.X], shape.dimensions[Axis.Y]);
                            context.fillStyle = '#4444EE';
                            context.fill();
                            // context.lineWidth = 1;
                            // context.strokeStyle = '#4444EE';      // dark blue
                            // context.stroke();
                            break;
                        default:
                            throw new Error("Shape not yet supported: " + ShapeTypes.toString(shapeType));
                    }
                });
                    
                this.renderTimer = requestAnimationFrame(this.render.bind(this));
            }
        }
    );
    
    // #######################################################################################################################
    // Setup a simple world & start UI
    
    var worldSize = 1000;
    
    var cfg = {
        dt: 60,
        gravity: Vec.Create(1,0),
        worldBox: new AABBShape([0, 0], [worldSize, worldSize])
    };
    
    var game = new SimplePlatformerWorld(cfg);
    
    var AddBox = function(x, y, w, h) {
        var def = {
            position: [x, y],
            shape: new AABBShape([0, 0], [w, h])
        };
        
        var obj = new WorldObject(def);
        game.addObject(obj);
        return obj;
    };
    
    AddBox(10, 10, 100, 10);
    AddBox(10, 190, 50, 10);
    AddBox(400, 400, 30, 10);
    
    // start UI
    var gameEl = $("#game");
    var gameUI = new SimplePlatformerUI(gameEl, game);
});