const mongoose = require("mongoose");

// Schema for React Flow Edges (used for UI linking between nodes)
const ReactFlowEdgeSchema = new mongoose.Schema({
    id: { type: String, required: true },
    source: { type: String, required: true }, // Source node id
    target: { type: String, required: true }, // Target node id
    label: { type: String }, // Optional edge label
    animated: { type: Boolean, default: false } // Optional animation flag
}, { _id: false });

// Main Workflow schema
const WorkflowSchema = new mongoose.Schema({
    name: { type: String, required: true },

    // Trigger definition, which can also be visualized in the editor.
    trigger: {
        id: { type: String, required: true },
        type: { type: String, enum: ["API_CALL"], required: true }, //, "SCHEDULED"
        // endpoint: { type: String, required: false },  // Used for API_CALL
        // scheduled_time: { type: Date, required: false },  // Used for SCHEDULED
        // ui: { // UI-specific properties for displaying the trigger node in React Flow
        //     position: {
        //         x: { type: Number, required: true },
        //         y: { type: Number, required: true }
        //     },
        //     label: { type: String } // Optional label for the node
        // },
        data: { type: mongoose.Schema.Types.Mixed } // Optional additional metadata
    },

    // Array of steps that contain the business logic.
    steps: [
        {
            id: { type: String, required: true }, // Using 'id' for consistency with React Flow
            type: { type: String, enum: ["action", "condition", "wait_for", "wait_until"], required: true },
            action_type: { type: String, enum: ["API_CALL", "EMAIL", "DB_UPDATE"], required: false },

            // API_CALL
            endpoint: { type: String, required: false },

            wait_time: { 
                type: { type: String, enum: ["seconds", "minutes", "hours", "days"], required: false },
                value: { type: Number, required: false }
            },
            wait_until: { type: Date, required: false },

            // condition
            condition: {
                type: { type: String, enum: ["equals", "not_equals", "greater_than", "less_than", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"], required: function() {
                    return this.parent().type === 'condition';
                }},
                field: { type: String, required: function() {
                    return this.parent().type === 'condition';
                }},
                value: { type: mongoose.Schema.Types.Mixed, required: function() {
                    return this.parent().type === 'condition';
                }},
                true_next: [{ type: String }],
                false_next: [{ type: String }]
            },

            next: [{ type: String }], // References to the next step(s) by id
            // ui: { // UI-specific properties for each step/node in the workflow editor
            //     position: {
            //         x: { type: Number, required: true },
            //         y: { type: Number, required: true }
            //     },
            //     label: { type: String } // Optional label for the step node
            // },
            
            data: { type: mongoose.Schema.Types.Mixed } // Optional additional metadata for the step
        }
    ],

    // Array of edges to define the visual connection between nodes.
    edges: [ReactFlowEdgeSchema]
});

const Workflow = mongoose.model("Workflow", WorkflowSchema);
module.exports = Workflow;
