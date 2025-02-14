const express = require("express");
const mongoose = require("mongoose");
const Agenda = require("agenda");
require("dotenv").config();

const Workflow = require("./models/Workflow");
const WorkflowInstance = require("./models/WorkflowInstance");

const app = express();
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log("DB Connection Error:", err));

// Agenda.js Setup
const agenda = new Agenda({ db: { address: process.env.MONGO_URI, collection: "workflows_agendaJobs" } });

// Job: Start a scheduled workflow
agenda.define("start_scheduled_workflow", async (job) => {
    const { workflow_id } = job.attrs.data;
    const workflow = await Workflow.findById(workflow_id);

    if (!workflow) {
        console.log("Workflow not found");
        return;
    }

    console.log(`Starting scheduled workflow: ${workflow.name}`);

    // Create a new workflow instance
    const instance = new WorkflowInstance({
        workflow_id: workflow_id,
        status: "IN_PROGRESS",
        current_step: workflow.steps[0].id,
        context: {},
        logs: []
    });
    await instance.save();

    // Immediately process the first step
    await agenda.now("process_workflow_step", { instanceId: instance._id });
});

// Job: Process a workflow step
agenda.define("process_workflow_step", async (job) => {
    const { instanceId } = job.attrs.data;
    await processWorkflowStep(instanceId);
});

function getWaitTime(wait_time) {
    if (wait_time.type === "seconds") {
        return new Date(Date.now() + wait_time.value * 1000);
    }
    else if (wait_time.type === "minutes") {
        return new Date(Date.now() + wait_time.value * 60 * 1000);
    }
    else if (wait_time.type === "hours") {
        return new Date(Date.now() + wait_time.value * 60 * 60 * 1000);
    }
    else if (wait_time.type === "days") {
        return new Date(Date.now() + wait_time.value * 24 * 60 * 60 * 1000);
    }
    else {
        return new Date(Date.now());
    }
}

// Function to process a single workflow step
async function processWorkflowStep(instanceId) {
    // Retrieve workflow instance and its definition
    const instance = await WorkflowInstance.findById(instanceId);
    if (!instance) return console.log(`Workflow instance ${instanceId} not found`);


    // stop the job if counter is greater than 200
    const counterLimit = instance.context?.counter_limit || 200;
    if (instance.context?.counter && instance.context.counter > counterLimit) {
        instance.status = "OVERFLOW";
        instance.current_step = null;
        await instance.save();
        console.log(`Workflow instance ${instanceId} completed (counter ${instance.context.counter} limit reached).`);
        return;
    }

    const workflow = await Workflow.findById(instance.workflow_id);
    if (!workflow) return console.log(`Workflow ${instance.workflow_id} not found`);

    // Find the current step in the workflow definition
    const currentStep = workflow.steps.find(step => step.id === instance.current_step);
    if (!currentStep) {
        // If no current step, mark workflow as complete
        instance.status = "COMPLETED";
        await instance.save();
        console.log(`Workflow instance ${instanceId} completed (no further steps).`);
        return;
    }

    console.log(`Processing step ${currentStep.id} (${currentStep.type}) for workflow ${workflow.name}`);
    console.log(instance.context.counter);

    if (instance.context) {
        instance.context = { ...instance.context, counter: (instance.context.counter || 0) + 1 };
    }
    else {
        instance.context = { counter: 1 };
    }
    await instance.save();

    // Process based on step type
    if (currentStep.type === "action") {
        // Simulate performing the action (e.g., API call, email, etc.)

        if (currentStep.action_type === "API_CALL") {
            console.log(`Executing API call: ${currentStep.endpoint}`);
        } else if (currentStep.action_type === "EMAIL") {
            console.log(`Sending email: ${currentStep.endpoint}`);
        } else if (currentStep.action_type === "DB_UPDATE") {
            console.log(`Updating database: ${currentStep.endpoint}`);
        }

        instance.logs.push({ step: currentStep.id, status: "COMPLETED", timestamp: new Date() });

        // Move to the next step if available
        if (currentStep.next && currentStep.next.length > 0) {
            instance.current_step = currentStep.next[0]; // choose the first next step
            await instance.save();
            // Queue the next step for immediate processing
            await agenda.now("process_workflow_step", { instanceId: instance._id });
        } else {
            // If no next step, mark the workflow as completed
            instance.status = "COMPLETED";
            await instance.save();
            console.log(`Workflow instance ${instanceId} completed.`);
        }
    }
    else if (currentStep.type === "wait_for") {
        // Schedule a job to resume after a wait period (wait_time in seconds stored in step data)
        console.log(`Waiting for ${currentStep.wait_time} seconds at step ${currentStep.id}`);
        instance.logs.push({ step: currentStep.id, status: "WAITING", timestamp: new Date() });
        await instance.save();

        // Update to the next step (if available) after waiting
        if (currentStep.next && currentStep.next.length > 0) {
            instance.current_step = currentStep.next[0];
            await instance.save();

            await agenda.schedule(getWaitTime(currentStep.wait_time), "process_workflow_step", { instanceId: instance._id });
        }
        else {
            // If no next step, mark the workflow as completed
            instance.status = "COMPLETED";
            instance.current_step = null;
            await instance.save();
            console.log(`Workflow instance ${instanceId} completed.`);
        }

    }
    else if (currentStep.type === "wait_until") {
        // Schedule a job to resume after a wait period (wait_time in seconds stored in step data)
        console.log(`Waiting until ${currentStep.wait_until} at step ${currentStep.id}`);
        instance.logs.push({ step: currentStep.id, status: "WAITING", timestamp: new Date() });
        await instance.save();

        // Update to the next step (if available) after waiting
        if (currentStep.next && currentStep.next.length > 0) {
            instance.current_step = currentStep.next[0];
            await instance.save();

            await agenda.schedule(currentStep.wait_until, "process_workflow_step", { instanceId: instance._id });
        }
        else {
            // If no next step, mark the workflow as completed
            instance.status = "COMPLETED";
            instance.current_step = null;
            await instance.save();
            console.log(`Workflow instance ${instanceId} completed.`);
        }
    }
    else if (currentStep.type === "condition") {
        console.log(`Evaluating condition at step ${currentStep.id}`);

        // const contactData = await Contact.findById(instance.context.contact_id);
        const contactData = {
            name: "John Doe",
            email: "john.doe@example.com",
            age: 30,
            is_active: true,
            counter: instance.context.counter
        };

        let conditionResult = false;


        if (currentStep.condition.type === "equals") {
            if (contactData[currentStep.condition.field] === currentStep.condition.value) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "not_equals") {
            if (contactData[currentStep.condition.field] !== currentStep.condition.value) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "greater_than") {
            if (contactData[currentStep.condition.field] > currentStep.condition.value) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "less_than") {
            if (contactData[currentStep.condition.field] < currentStep.condition.value) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "contains") {
            if (contactData[currentStep.condition.field].includes(currentStep.condition.value)) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "not_contains") {
            if (!contactData[currentStep.condition.field].includes(currentStep.condition.value)) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "starts_with") {
            if (contactData[currentStep.condition.field].startsWith(currentStep.condition.value)) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "ends_with") {
            if (contactData[currentStep.condition.field].endsWith(currentStep.condition.value)) {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "is_empty") {
            if (contactData[currentStep.condition.field] === "") {
                conditionResult = true;
            }
        }
        else if (currentStep.condition.type === "is_not_empty") {
            if (contactData[currentStep.condition.field] !== "") {
                conditionResult = true;
            }
        }

        if (conditionResult && currentStep.condition.true_next && currentStep.condition.true_next.length > 0) {
            instance.current_step = currentStep.condition.true_next[0]; // choose the branch for true
        } else if (currentStep.condition.false_next && currentStep.condition.false_next.length > 0) {
            instance.current_step = currentStep.condition.false_next[0]; // choose the branch for false
        } else {
            instance.current_step = null;
        }

        instance.logs.push({ step: currentStep.id, status: "COMPLETED", timestamp: new Date() });
        await instance.save();

        if (instance.current_step) {
            await agenda.now("process_workflow_step", { instanceId: instance._id });
        } else {
            instance.status = "COMPLETED";
            await instance.save();
            console.log(`Workflow instance ${instanceId} completed (condition branch ended).`);
        }
    } else {
        console.log(`Unknown step type: ${currentStep.type}`);
    }
}

// API: Get all workflows
app.get("/workflows/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const workflow = await Workflow.findById(id);
        if (!workflow) return res.status(404).json({ error: "Workflow not found" });
        res.status(200).json(workflow);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Create Workflow
app.post("/workflow", async (req, res) => {
    try {
        const workflow = new Workflow(req.body);
        await workflow.save();

        // // If it's a scheduled workflow, add it to Agenda.js
        // if (workflow.trigger.type === "SCHEDULED" && workflow.trigger.scheduled_time) {
        //     await agenda.schedule(workflow.trigger.scheduled_time, "start_scheduled_workflow", { workflow_id: workflow._id });
        // }

        res.status(201).json(workflow);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Update Workflow
app.post("/workflow/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const workflow = await Workflow.findById(id);
        if (!workflow) return res.status(404).json({ error: "Workflow not found" });

        await workflow.updateOne(req.body);
        res.status(200).json(workflow);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
})

// API: Start Workflow Manually (via API call or webhook)
app.post("/workflow/:id/start", async (req, res) => {
    try {
        const { id } = req.params;
        const workflow = await Workflow.findById(id);
        if (!workflow) return res.status(404).json({ error: "Workflow not found" });

        const instance = new WorkflowInstance({
            workflow_id: id,
            status: "IN_PROGRESS",
            current_step: workflow.steps[0].id,
            context: {
                counter: 0,
                counter_limit: 200,
                ...req.body
            },
            logs: []
        });
        await instance.save();

        // Start processing the first step
        await agenda.now("process_workflow_step", { instanceId: instance._id });

        res.status(200).json({ message: "Workflow started", instance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Agenda
(async function () {
    await agenda.start();
})();

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
