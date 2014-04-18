/**
 * This file loads and starts the game and its UI.
 */
"use strict";

// configure requirejs
require.config({
    baseUrl : "",
    paths : {
        Lib: "lib",
        Box2d: "lib/box2djs",
    
        Util: "js/util",
        Squishy: "js/util/squishy",
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
    
    // box2d
    "Box2d/common/math/b2Math",
    "Box2d/common/math/b2Vec2",
    "Box2d/common/collision/b2AABB",

    // Other non-UI stuff
    "Squishy", "Lib/GameAI",
    "localizer"
];

/**
 * @const
 */
var gameContainerCSS = {
    "position": "absolute",
    "left": "0px",
    "right": "0px",
    "top": "0px",
    "bottom": "0px",
    
    "background-color": "grey"
};


// load game and initialize UI
require(dependencies, function() {
    var game = $("#game").css(gameContainerCSS);
    
    
    
    // ##################################################################################################
    // Game constants
    
    /**
     * Contains a bunch of enums, denoting constant identifiers.
     * @const
     */
    var GameConstants = {
        /**
         * All possible agent actions.
         * In this world, all possible moves indicate velocity directions.
         */
        AgentAction: squishy.makeEnum([
            "startMoveLeft", "startMoveRight", "stopMove", "jump"
        ])
    };
    
    // ##################################################################################################
    // Object class
    
    /**
     * Creates a new world object.
     * @constructor
     */
    var WorldObject = function(objectDefinition) {
        // copy all parameters into object
        squishy.clone(objectDefinition, true, this);
        
        // agents start alive
        if (this.isAgent()) {
            this.health = this.def.maxHealth;
        }
    };
    
    // methods
    WorldObject.prototype = {
        /**
         * Wether this is an agent. Agents can move and can die.
         * @sealed
         */
        isAgent: function() { return this.maxHealth > 0; },
        
        /**
         * Static objects or agents without health are dead.
         */
        isAlive: function() { return this.health > 0; }
        
        /**
         * Currently, only living agents can move.
         */
        canMove: function() { return this.isAgent() && this.isAlive(); },
        
        
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
    };
    
    
    // ##################################################################################################
    // World class
    
    /**
     * Creates a new world.
     * @constructor
     * @param {b2AABB} worldBox Defines the bounds of the world.
     */
    var SimplePlatformerWorld = function(config, worldBox) {
        // check parameter validity
        squishy.assert(config, "config is invalid");
        squishy.assert(config.dt > 0, "config.dt is invalid");      // must be positive
        
        squishy.assert(boundingBox && boundingBox.IsValid(), "worldBox is invalid");
       
        this.config = config;
        this.worldBox = worldBox;
        
        // create all world events
        this.events = {
            /**
             * Platformer starts. args = configuration + all initially visible objects.
             */
            started: squishy.createEvent(),
            
            /**
             * Object moved. args = updated object state
             */
            objectMoved: squishy.createEvent(),
            
            /**
             * A new object has become visible (or was added into the world).
             */
            objectAdded: squishy.createEvent(),
            
            /**
             * Object is no longer visible. args = object id
             */
            objectGone: squishy.createEvent(),
            
            /**
             * An agent died. args = object id
             */
            agentDead: squishy.createEvent()
        };
        
        // create set of all world objects
        this.objects = {};
    };
    
    /**
     * Running id.
     */
    var lastObjectId = 0;
   
    // methods
    SimplePlatformerWorld.prototype = {
        /**
         * Adds the given object to the world.
         */
        addObject: function(obj) {
            // assign id to object, if it does not exist yet
            obj.objectId = obj.objectId || ++lastObjectId;
            
            // make sure, objects cannot be added twice
            squishy.assert(!this.objects[objectId], "Object was added twice: " + obj);
            
            // add object
            this.objects[objectId] = obj;
            
            // TODO: Raise event
        },
        
        /**
         * Removes the given object from the world
         */
        removeObject: function(obj) {
            delete this.objects[obj.objectId];
            
            // TODO: Raise event
        },
        
        /**
         * Advance step by given amount of time. Uses config.dt if dt is not given.
         */
        step: function(dt) {
            dt = dt || this.config.dt;
            
            
        }
    };
    
    
    
    // ##################################################################################################
    // Setup a simple scene
});