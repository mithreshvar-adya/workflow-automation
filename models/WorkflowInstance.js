const mongoose = require("mongoose");

const WorkflowInstanceSchema = new mongoose.Schema({
    workflow_id: { type: mongoose.Schema.Types.ObjectId, ref: "Workflow", required: true },
    status: { type: String, enum: ["IN_PROGRESS", "COMPLETED", "FAILED"], default: "IN_PROGRESS" },
    current_step: { type: String },
    context: { type: Object }, // Stores dynamic data like { "order_id": 123, "user_email": "abc@example.com" }
    logs: [
        {
            step: String,
            status: { type: String, enum: ["COMPLETED", "FAILED", "WAITING", "OVERFLOW"] },
            timestamp: { type: Date, default: Date.now }
        }
    ]
});

const WorkflowInstance = mongoose.model("WorkflowInstance", WorkflowInstanceSchema);
module.exports = WorkflowInstance;
