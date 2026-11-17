#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DoseGuardStack } from '../lib/doseguard-stack';

const app = new cdk.App();

const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'ap-south-1';
const account = process.env.CDK_DEFAULT_ACCOUNT;

const stack = new DoseGuardStack(app, 'DoseGuardAIStack', {
  env: {
    account,
    region,
  },
  description: 'DoseGuard AI — Serverless Medication Safety & Caregiver Escalation Platform',
});

cdk.Tags.of(stack).add('Project', 'DoseGuardAI');
cdk.Tags.of(stack).add('Environment', 'Hackathon');

