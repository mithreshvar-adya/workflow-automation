const mongoose = require("mongoose");

const JobQueueSchema = new mongoose.Schema({
    workflow_instance_id: { type: mongoose.Schema.Types.ObjectId, ref: "WorkflowInstance", required: true },
    step_id: { type: String, required: true },
    execute_at: { type: Date, required: true }, // When to execute this step
    status: { type: String, enum: ["PENDING", "COMPLETED"], default: "PENDING" }
});

const JobQueue = mongoose.model("JobQueue", JobQueueSchema);
module.exports = JobQueue;
