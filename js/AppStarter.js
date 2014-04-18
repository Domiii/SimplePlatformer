/**
 * This file loads and starts the game and its UI.
 */
"use strict";

// configure requirejs
require.config({
    baseUrl : "",
    paths : {
        Lib: "lib",
    
        Util: "js/util",
        squishy: "js/util/squishy",
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

    // Non-UI stuff
    "squishy", "localizer"
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
    
    /**
     * Creates a new rectangle, to be used as a shape for a CollisionObject.
     * @constructor
     * @param {} position
     */
    var Rectangle = function(position, dimensions) {
        this.position = position;
        this.dimensions = dimensions;
    };
    
    /**
     * Creates a static, colliding object of given shape.
     * @constructor
     */
    var CollisionObject = function(shape) {
        this.shape = shape;
    };
});