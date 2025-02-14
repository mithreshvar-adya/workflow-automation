import { CronJob } from 'cron';
import { Contact } from '../models/Contact.js';
import { Automation } from '../models/Automation.js';
import { emailService } from './EmailService.js';

class AutomationEngine {
  constructor() {
    this.job = new CronJob('*/5 * * * *', this.processAutomations.bind(this));
    this.job.start();
  }

  async evaluateCondition(condition, contact) {
    const value = contact[condition.field] || contact.customFields.get(condition.field);
    
    switch(condition.operator) {
      case 'equals': return value === condition.value;
      case 'contains': return value?.includes(condition.value);
      case 'greater_than': return value > condition.value;
      case 'less_than': return value < condition.value;
      default: return false;
    }
  }

  async processAutomations() {
    const contacts = await Contact.find({
      'automationStates.status': 'active',
      'automationStates.nextExecutionTime': { $lte: new Date() }
    });

    for (const contact of contacts) {
      for (const state of contact.automationStates) {
        const automation = await Automation.findById(state.automationId);
        if (!automation?.active) continue;

        const step = automation.steps[state.currentStep];
        await this.processStep(step, contact);
        
        state.currentStep++;
        if (state.currentStep >= automation.steps.length) {
          state.status = 'completed';
        } else {
          state.nextExecutionTime = this.calculateNextExecutionTime(automation.steps[state.currentStep]);
        }
        state.lastUpdated = new Date();
      }
      await contact.save();
    }
  }

  calculateNextExecutionTime(step) {
    if (step.type !== 'wait') return new Date();
    
    const now = new Date();
    const duration = step.data.duration;
    
    const multipliers = {
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000
    };
    
    return new Date(now.getTime() + duration * (multipliers[step.data.timeUnit] || 0));
  }

  async processStep(step, contact) {
    try {
      switch(step.type) {
        case 'email':
          await emailService.sendEmail(
            contact.email,
            step.data.subject,
            step.data.body
          );
          contact.activities.push({
            type: 'email_sent',
            description: `Email sent: ${step.data.subject}`
          });
          break;

        case 'tag':
          if (step.data.tagOperation === 'add') {
            contact.tags.addToSet(step.data.tagValue);
          } else {
            contact.tags.pull(step.data.tagValue);
          }
          contact.activities.push({
            type: 'tag_updated',
            description: `Tag ${step.data.tagOperation}ed: ${step.data.tagValue}`
          });
          break;

        case 'webhook':
          await fetch(step.data.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contact)
          });
          contact.activities.push({
            type: 'webhook_triggered',
            description: `Webhook called: ${step.data.webhookUrl}`
          });
          break;

        case 'condition':
          const conditionsMet = step.data.conditions.every(
            condition => this.evaluateCondition(condition, contact)
          );
          if (!conditionsMet) {
            state.status = 'terminated';
          }
          break;
      }
    } catch (error) {
      contact.activities.push({
        type: 'error',
        description: `Error processing step: ${error.message}`
      });
    }
  }
}

export const automationEngine = new AutomationEngine();