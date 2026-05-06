# Lab 4 — Highly Available Multi-AZ VPC on AWS

## Overview

This lab designs and deploys a production-grade, highly available Virtual Private Cloud (VPC) on AWS using Infrastructure as Code (IaC) via AWS CloudFormation. The architecture spans two Availability Zones, implements a public/private subnet model, uses AZ-aligned NAT Gateways to eliminate cross-AZ dependencies, and manages all EC2 access exclusively through AWS Systems Manager Session Manager — with no SSH access permitted anywhere.

---

## Architecture

```
                          Internet
                             │
                    ┌────────────────┐
                    │ Internet Gateway│
                    └────────────────┘
                             │
          ┌──────────────────┴──────────────────┐
          │              VPC 10.0.0.0/16         │
          │                                       │
          │  ┌─────────────┐  ┌─────────────┐   │
          │  │  AZ-A        │  │  AZ-B        │   │
          │  │              │  │              │   │
          │  │ Public Subnet│  │ Public Subnet│   │
          │  │ 10.0.1.0/24  │  │ 10.0.2.0/24  │   │
          │  │ ┌──────────┐ │  │ ┌──────────┐ │   │
          │  │ │NAT GW A  │ │  │ │NAT GW B  │ │   │
          │  │ │Elastic IP│ │  │ │Elastic IP│ │   │
          │  │ └──────────┘ │  │ └──────────┘ │   │
          │  │ ┌──────────┐ │  │ ┌──────────┐ │   │
          │  │ │Web EC2 A │ │  │ │Web EC2 B │ │   │
          │  │ │  Apache  │ │  │ │  Apache  │ │   │
          │  │ └──────────┘ │  │ └──────────┘ │   │
          │  │              │  │              │   │
          │  │ Private Sub. │  │ Private Sub. │   │
          │  │ 10.0.3.0/24  │  │ 10.0.4.0/24  │   │
          │  │ ┌──────────┐ │  │ ┌──────────┐ │   │
          │  │ │App EC2 A │ │  │ │App EC2 B │ │   │
          │  │ │SSM only  │ │  │ │SSM only  │ │   │
          │  │ └──────────┘ │  │ └──────────┘ │   │
          │  └─────────────┘  └─────────────┘   │
          └───────────────────────────────────────┘
```

### Traffic Flow

**Inbound (internet → web tier):**
Internet → Internet Gateway → Public Subnet → Security Group check (port 80) → Web EC2

**Outbound from private tier:**
App EC2 → Private Route Table → NAT Gateway (same AZ) → Internet Gateway → Internet

**No cross-AZ NAT routing** — AZ-A private subnet routes exclusively through NAT Gateway A, AZ-B through NAT Gateway B. An AZ failure is fully contained.

---

## AWS Services Used

| Service | Purpose |
|---|---|
| Amazon VPC | Isolated network container for all resources |
| Public Subnets (x2) | Host web EC2 instances and NAT Gateways |
| Private Subnets (x2) | Host app EC2 instances, no direct internet exposure |
| Internet Gateway | Entry and exit point for public internet traffic |
| NAT Gateway (x2) | Outbound-only internet access for private subnets |
| Elastic IP (x2) | Static public IPs assigned to NAT Gateways |
| Route Tables (x3) | 1 public (shared), 2 private (one per AZ) |
| Security Groups (x2) | Web tier (HTTP + ICMP), App tier (ICMP from VPC only) |
| EC2 Instances (x4) | 2 public web servers, 2 private app servers |
| IAM Role + Instance Profile | Grants EC2 instances SSM permissions |
| AWS Systems Manager | Session Manager access — no SSH required |
| AWS CloudFormation | Infrastructure as Code — entire stack in one template |

---

## Network Design

### CIDR Allocation

| Resource | CIDR |
|---|---|
| VPC | 10.0.0.0/16 |
| Public Subnet A (AZ-A) | 10.0.1.0/24 |
| Public Subnet B (AZ-B) | 10.0.2.0/24 |
| Private Subnet A (AZ-A) | 10.0.3.0/24 |
| Private Subnet B (AZ-B) | 10.0.4.0/24 |

### Route Tables

| Route Table | Subnet Association | Destination | Target |
|---|---|---|---|
| Public RT | Public Subnet A + B | 0.0.0.0/0 | Internet Gateway |
| Private RT A | Private Subnet A | 0.0.0.0/0 | NAT Gateway A |
| Private RT B | Private Subnet B | 0.0.0.0/0 | NAT Gateway B |

All route tables also contain the automatic local route `10.0.0.0/16 → local` added by AWS.

### Security Groups

**Web Tier Security Group (`lab4-web-sg`)**

| Direction | Protocol | Port | Source | Reason |
|---|---|---|---|---|
| Inbound | TCP | 80 | 0.0.0.0/0 | Allow HTTP from internet |
| Inbound | ICMP | -1 | 0.0.0.0/0 | Allow ping for validation |
| Outbound | All | All | 0.0.0.0/0 | Allow all outbound (default) |

**App Tier Security Group (`lab4-app-sg`)**

| Direction | Protocol | Port | Source | Reason |
|---|---|---|---|---|
| Inbound | ICMP | -1 | 10.0.0.0/16 | Allow ping from within VPC only |
| Outbound | All | All | 0.0.0.0/0 | Allow all outbound via NAT GW |

No inbound SSH (port 22) is permitted on any security group. All access is via Session Manager.

---

## EC2 Instances

| Instance | Subnet | AZ | Security Group | Access | Role |
|---|---|---|---|---|---|
| lab4-web-ec2-a | Public Subnet A | AZ-A | Web Tier SG | SSM + HTTP | Apache web server |
| lab4-web-ec2-b | Public Subnet B | AZ-B | Web Tier SG | SSM + HTTP | Apache web server |
| lab4-app-ec2-a | Private Subnet A | AZ-A | App Tier SG | SSM only | Private app server |
| lab4-app-ec2-b | Private Subnet B | AZ-B | App Tier SG | SSM only | Private app server |

All instances use Amazon Linux 2023 and `t2.micro`. The AMI is dynamically resolved at deploy time using AWS SSM public parameters — no hardcoded AMI IDs.

---

## IAM & SSM Configuration

All EC2 instances are attached an IAM Instance Profile containing a role with the `AmazonSSMManagedInstanceCore` managed policy. This grants the minimum permissions required for Session Manager to:

- Register the instance with SSM
- Open interactive terminal sessions
- Send and receive session data
- Write session logs

The trust policy on the role allows only `ec2.amazonaws.com` to assume it — no other AWS service or user can use this role.

---

## Prerequisites

Before deploying this stack you need:

- An AWS account with sufficient permissions to create VPC, EC2, IAM, and SSM resources
- AWS CLI installed and configured (optional — console deployment supported)
- A public GitHub repository connected to AWS CloudFormation via Git Sync
- Git installed locally

---

## Deployment Instructions

This stack is deployed via **AWS CloudFormation Git Sync** — any push to the `main` branch automatically triggers a stack update.

### First-time deployment

1. Clone this repository:
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

2. Navigate to the lab directory:
```bash
cd lab-4
```

3. In the AWS Console go to **CloudFormation → Create stack → With new resources (standard)**

4. Select **Sync from Git** and connect your GitHub repository

5. Set the deployment file path to:
```
lab-4/deployment.yaml
```

6. Set stack name to `lab4-vpc`

7. Leave all parameters as default — they are pre-configured in the template

8. Click through and submit. CloudFormation will deploy all resources automatically.

### Updating the stack

Any change pushed to `main` automatically triggers a CloudFormation sync and updates the stack:

```bash
git add .
git commit -m "your change description"
git push origin main
```

### Stack Parameters

All parameters have sensible defaults and do not need to be changed for standard deployment:

| Parameter | Default | Description |
|---|---|---|
| VpcCiDR | 10.0.0.0/16 | VPC IP range |
| PublicSubnet1CIDR | 10.0.1.0/24 | Public subnet AZ-A |
| PublicSubnet2CIDR | 10.0.2.0/24 | Public subnet AZ-B |
| PrivateSubnet1CIDR | 10.0.3.0/24 | Private subnet AZ-A |
| PrivateSubnet2CIDR | 10.0.4.0/24 | Private subnet AZ-B |

---

## Validation

### 1. Browser test — web tier

After deployment, go to **CloudFormation → Stacks → lab4-vpc → Outputs** and copy the public IPs:

```
http://WebInstanceAPublicIP
http://WebInstanceBPublicIP
```

Both should display the Apache page with the lab name and your full name.

### 2. Session Manager access

1. Go to **EC2 → Instances**
2. Select any instance
3. Click **Connect → Session Manager → Connect**
4. A browser terminal opens — no SSH key needed

### 3. Public to private ping

From a web instance Session Manager session, ping a private instance using its private IP:

```bash
ping 10.0.3.x   # Private IP of app-ec2-a
```

Expected: 0% packet loss, `ttl=127`, sub-millisecond response.

### 4. Private instance outbound internet via NAT Gateway

From a private instance Session Manager session:

```bash
ping 8.8.8.8
```

Expected: successful ping to Google DNS — proves outbound internet access through NAT Gateway.

### 5. Traceroute — confirm NAT Gateway routing

From a private instance Session Manager session:

```bash
traceroute 8.8.8.8
```

Expected: Hop 1 should be a `10.0.1.x` address — the NAT Gateway's private IP in the public subnet. This confirms traffic is routing correctly through the NAT Gateway.

### 6. Package installation from private instance

```bash
sudo yum install -y tree
```

Expected: package downloads and installs successfully — confirms private instance can reach AWS package repositories through NAT Gateway.

---

## High Availability Design Decisions

**Why two NAT Gateways?**
A single NAT Gateway creates a cross-AZ dependency. If the AZ hosting it fails, all private subnets in other AZs lose outbound internet access. One NAT Gateway per AZ ensures failures are fully contained — AZ-A going down has zero impact on AZ-B.

**Why separate private route tables per AZ?**
Each private subnet must route to its own AZ-local NAT Gateway. A shared route table can only point to one NAT Gateway, which would force cross-AZ traffic. Separate route tables eliminate this.

**Why no SSH?**
SSH requires open port 22, key pair management, and a bastion host or public IP for private instances. Session Manager eliminates all of this — access is granted via IAM, sessions are logged in CloudTrail, and no inbound ports need to be open. This is the AWS-recommended approach for EC2 access management.

**Why IaC?**
Manual console deployments are error-prone, not repeatable, and not auditable. CloudFormation ensures every deployment is identical, version controlled, and can be reviewed, updated, and deleted cleanly as a single unit.

---

## Repository Structure

```
lab-4/
├── template.yaml        # CloudFormation template — full infrastructure definition
├── deployment.yaml      # Git Sync deployment config — points CloudFormation to template
└── README.md            # This file
```

---

## Author

**Eric Obeng**

Cloud Engineering — Lab 4