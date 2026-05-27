# AWS Auto Scaling Web Tier Lab

Highly available, auto-scaling web application on AWS using EC2 Auto Scaling and an Application Load Balancer (ALB). All infrastructure is provisioned via CloudFormation (Infrastructure as Code).

## Architecture Overview

```
                    ┌─────────────┐
                    │  End Users   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │     IGW      │
                    └──────┬──────┘
                           │
  ┌────────────────────────┼────────────────────────┐
  │  VPC (10.0.0.0/16)    │                         │
  │                        │                         │
  │  ┌─── AZ-1 ─────────┐ │ ┌─── AZ-2 ─────────┐  │
  │  │ Public 10.0.1.0/24│ │ │ Public 10.0.2.0/24│  │
  │  │  ┌─────────────┐  │ │ │  ┌─────────────┐  │  │
  │  │  │     ALB      │  │ │ │  │ NAT Gateway  │  │  │
  │  │  └──────┬──────┘  │ │ │  └──────────────┘  │  │
  │  └─────────┼─────────┘ │ └────────────────────┘  │
  │            │            │                         │
  │  ┌─── AZ-1 ──────────┐ │ ┌─── AZ-2 ──────────┐  │
  │  │ Private 10.0.3.0/24│ │ │ Private 10.0.4.0/24│  │
  │  │  ┌──────────────┐  │ │ │  ┌──────────────┐  │  │
  │  │  │ EC2 (Apache)  │  │ │ │  │ EC2 (Apache)  │  │  │
  │  │  └──────────────┘  │ │ │  └──────────────┘  │  │
  │  └─── ASG (1-4) ─────┘ │ └─── ASG (1-4) ─────┘  │
  └─────────────────────────┴────────────────────────┘
```

## Components

| Component                | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| **VPC**                  | Isolated network (10.0.0.0/16)                                     |
| **Public Subnets (x2)**  | Host ALB and NAT Gateway across 2 AZs                              |
| **Private Subnets (x2)** | Host EC2 instances — no direct internet access                     |
| **Internet Gateway**     | Enables internet access for public subnets                         |
| **NAT Gateway**          | Enables outbound internet for private instances (package installs) |
| **ALB**                  | Internet-facing load balancer — single public endpoint             |
| **Target Group**         | Pool of healthy EC2 instances with health checks                   |
| **Launch Template**      | EC2 blueprint: Amazon Linux 2 + Apache + stress tool               |
| **Auto Scaling Group**   | Manages EC2 lifecycle (min: 1, desired: 1, max: 4)                 |
| **Scaling Policy**       | Target tracking — scales out/in at 30% avg CPU                     |

## Scaling Policy Explained

This solution uses **Target Tracking Scaling** with a target of **30% average CPU utilization**:

- **Scale Out**: When average CPU exceeds 30%, the ASG launches additional instances (up to max 4). CloudWatch evaluates the metric over a 3-minute window before triggering.
- **Scale In**: When average CPU drops below 30%, the ASG terminates excess instances (down to min 1). A cooldown period prevents rapid fluctuations.
- **Why 30%?**: This low threshold is intentional for demonstration purposes. In production, 60-70% is more typical. At 30%, the CPU stress button easily triggers observable scaling events.

## Deployment Instructions

### Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured, or access to the AWS Console

### Option 1: AWS Console

1. Go to **CloudFormation** → **Create Stack** → **With new resources**
2. Upload `template.yaml`
3. Stack name: `autoscaling-lab`
4. Accept default parameters or customize instance type
5. Click **Create Stack** and wait (~5 minutes)
6. Go to **Outputs** tab → copy the **ALBEndpoint** URL

### Option 2: AWS CLI

```bash
aws cloudformation create-stack \
  --stack-name autoscaling-lab \
  --template-body file://template.yaml \
  --capabilities CAPABILITY_IAM

# Wait for completion
aws cloudformation wait stack-create-complete --stack-name autoscaling-lab

# Get the ALB URL
aws cloudformation describe-stacks --stack-name autoscaling-lab \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBEndpoint`].OutputValue' \
  --output text
```

### Option 3: CloudFormation GitSync

1. Push `template.yaml` to a GitHub repository
2. In CloudFormation, create a stack with **GitSync** as the source
3. Point to the repository and template path
4. Changes pushed to the repo will auto-deploy

## Demonstration Guide

### 1. Verify Application Access

- Open the ALB DNS URL in your browser
- Confirm the page loads showing Instance ID, Private IP, and AZ

### 2. Verify Load Balancing

- Refresh the page multiple times
- **With 1 instance**: the Instance ID stays the same (expected)
- **After scale-out**: the Instance ID will alternate between instances

### 3. Trigger Scale-Out

1. Click the **"Trigger CPU Stress Test"** button on the web page
2. The stress test runs 4 CPU workers for 5 minutes
3. Monitor in the AWS Console:
   - **EC2 → Auto Scaling Groups → Activity**: watch for scaling events
   - **CloudWatch → Alarms**: see the CPU alarm trigger
   - **EC2 → Target Groups → Targets**: watch new instances register
4. New instances should appear within **3-5 minutes**

### 4. Verify Scale-In (Extra Credit)

- After the stress test completes (5 min), CPU drops below 30%
- The ASG will gradually remove excess instances
- Observe the Activity History for scale-in events

## Security Design

- EC2 instances are in **private subnets** — no public IP, no direct inbound access
- **No SSH access** — no port 22 ingress rule on EC2 security group
- EC2 security group only accepts HTTP from the **ALB security group** (not 0.0.0.0/0)
- NAT Gateway provides **outbound-only** internet access for package installation
- **IMDSv2** used for instance metadata (token-based, more secure than IMDSv1)

## Cost Optimization

- **Single NAT Gateway** instead of one per AZ (sufficient for non-production)
- **t2.micro** default instance type (free tier eligible)
- ASG starts with **desired capacity of 1** (minimum cost)
- Scales down automatically when demand drops (target tracking handles scale-in)

## Clean Up

```bash
aws cloudformation delete-stack --stack-name autoscaling-lab
```

**Important**: Delete the stack when done to avoid ongoing NAT Gateway and ALB charges.

## Files

| File            | Description                                      |
| --------------- | ------------------------------------------------ |
| `template.yaml` | Complete CloudFormation template (all resources) |
| `README.md`     | This documentation                               |
