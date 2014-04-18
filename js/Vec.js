/**
 * Vector math. Mostly based on b2Vec.js and b2Math.js.
 */
"use strict";


define(["Squishy"], function() {        
    /**
     * Global axis enum.
     */
    squishy.getGlobalContext().Axis = {
        X: 0,
        Y: 1,
        
        getOtherAxis: function(axis) { return axis == Axis.X ? Axis.Y : Axis.X; }
    };
    
    /**
     * Vector math.
     */
    var Vec = {
        Create: function(x, y) { return [x, y]; },
        IsValid: function(v) { return v instanceof Array && v.length == 2 && isFinite(v[0]) && isFinite(v[1]); },
        SetZero: function(v) { v[Axis.X] = 0.0; v[Axis.Y] = 0.0; },
        SetV: function(v, x_, y_) {v[Axis.X]=x_; v[Axis.Y]=y_;},
        Set: function(v, u) {v[Axis.X]=u[Axis.X]; v[Axis.Y]=u[Axis.Y];},

        Negative: function() { return [-v[Axis.X], -v[Axis.Y]]; },

        Copy: function(v){
            return [v[Axis.X],v[Axis.Y]];
        },

        Translate: function(v, u)
        {
            v[Axis.X] += u[Axis.X]; v[Axis.Y] += u[Axis.Y];
        },

        /**
         * Same as Translate.
         */
        Add: function(v, u)
        {
            v[Axis.X] += u[Axis.X]; v[Axis.Y] += u[Axis.Y];
        },

        Subtract: function(v, u)
        {
            v[Axis.X] -= u[Axis.X]; v[Axis.Y] -= u[Axis.Y];
        },

        /**
         * Returns a new vector containing the result.
         */
        SubtractGet: function(v, u)
        {
            return [v[Axis.X] - u[Axis.X], v[Axis.Y] - u[Axis.Y]];
        },

        Scale: function(v, u)
        {
            v[Axis.X] *= u[Axis.X]; v[Axis.Y] *= u[Axis.Y];
        },

        /**
         * Same as Scale.
         */
        Mul: function(v, u)
        {
            v[Axis.X] *= u[Axis.X]; v[Axis.Y] *= u[Axis.Y];
        },

        MulS: function(v, s)
        {
            v[Axis.X] *= s; v[Axis.Y] *= s;
        },

        MulM: function(v, A)
        {
            var tX = v[Axis.X];
            v[Axis.X] = A.col1[Axis.X] * tX + A.col2[Axis.X] * v[Axis.Y];
            v[Axis.Y] = A.col1[Axis.Y] * tX + A.col2[Axis.Y] * v[Axis.Y];
        },

        MulTM: function(v, A)
        {
            var tX = Vec.Dot(v, A.col1);
            v[Axis.Y] = Vec.Dot(v, A.col2);
            v[Axis.X] = tX;
        },

        Div: function(v, u)
        {
            v[Axis.X] /= u[Axis.X]; v[Axis.Y] /= u[Axis.Y];
        },

        Inverse: function(v)
        {
            v[Axis.X] = 1/v[Axis.X]; v[Axis.Y] = 1/v[Axis.Y];
        },
        
        Dot: function(v, u)
        {
            return v.x * u.x + v.y * u.y;
        },

        Cross: function(v)
        {
            var tX = v[Axis.X];
            v[Axis.X] = v[Axis.Y];
            v[Axis.Y] = -tX;
        },

        /**
         * Scaled cross product.
         */
        CrossS: function(v, s)
        {
            var tX = v[Axis.X];
            v[Axis.X] = -s * v[Axis.Y];
            v[Axis.Y] = s * tX;
        },

        Min: function(v, b)
        {
            v[Axis.X] = v[Axis.X] < b[Axis.X] ? v[Axis.X] : b[Axis.X];
            v[Axis.Y] = v[Axis.Y] < b[Axis.Y] ? v[Axis.Y] : b[Axis.Y];
        },

        Max: function(v, b)
        {
            v[Axis.X] = v[Axis.X] > b[Axis.X] ? v[Axis.X] : b[Axis.X];
            v[Axis.Y] = v[Axis.Y] > b[Axis.Y] ? v[Axis.Y] : b[Axis.Y];
        },

        Abs: function(v)
        {
            v[Axis.X] = Math.abs(v[Axis.X]);
            v[Axis.Y] = Math.abs(v[Axis.Y]);
        },

        LengthSquared: function(v)
        {
            return v[Axis.X] * v[Axis.X] + v[Axis.Y] * v[Axis.Y];
        },

        Length: function(v)
        {
            return Math.sqrt(v[Axis.X] * v[Axis.X] + v[Axis.Y] * v[Axis.Y]);
        },

        Normalize: function(v)
        {
            var length = v.Length();
            if (length < Number.MIN_VALUE)      // length < epsilon
            {
                return 0.0;
            }
            var invLength = 1.0 / length;
            v[Axis.X] *= invLength;
            v[Axis.Y] *= invLength;

            return length;
        },
        
        /**
         * Transform to a different non-rotated reference frame (e.g. between viewport and world).
         */
        ScaleAndTranslate: function(v, scaleV, translationV) {
            Vec.Scale(v, scaleV);
            Vec.Translate(v, translationV);
        },
        
        Zero: function() { return [0, 0]; }
    };
    
    return Vec;
});