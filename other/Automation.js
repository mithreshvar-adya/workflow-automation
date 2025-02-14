import mongoose from 'mongoose';

const automationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trigger: {
    type: { type: String, enum: ['tag_added', 'list_subscription', 'form_submission', 'custom_field_updated', 'website_visit'] },
    conditions: {
      field: String,
      operator: String,
      value: mongoose.Schema.Types.Mixed
    }
  },
  steps: [{
    type: { type: String, enum: ['email', 'wait', 'condition', 'tag', 'list', 'webhook', 'notification'] },
    data: {
      subject: String,
      body: String,
      duration: Number,
      timeUnit: String,
      conditions: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed
      }],
      tagOperation: { type: String, enum: ['add', 'remove'] },
      tagValue: String,
      webhookUrl: String,
      notificationMessage: String
    }
  }],
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export const Automation = mongoose.model('Automation', automationSchema);