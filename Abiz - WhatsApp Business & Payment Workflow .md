Abiz — WhatsApp Business Workflow & 
Payment System 
1. Business Owner Creates an Abiz Account 
The business owner: 
1. Creates an Abiz account. 
2. Enters their business details. 
3. Selects an Abiz subscription/plan. 
4. Completes payment through the Abiz payment gateway. 
5. Connects their Meta Business Portfolio. 
6. Connects/selects their WhatsApp Business Account (WABA). 
7. Connects their WhatsApp Business phone number through the official WhatsApp Cloud 
API. 
8. Abiz verifies the connection. 
9. The connected WhatsApp number appears inside the Abiz dashboard. 
2. Important: The WhatsApp Number Can 
Also Be Used With Meta Ads 
The business owner may use the same WhatsApp Business number for Meta/Instagram 
advertising. 
Example: 
Meta Ad → WhatsApp CTA → Customer's WhatsApp → Customer sends "Hi" → Abiz receives the 
message 
The flow should work like this: 
Customer sees Meta/Instagram Ad 
          ↓ 
Clicks "Send WhatsApp Message" 
          ↓ 
WhatsApp opens 
          ↓ 
Customer sends "Hi" 
          ↓ 
WhatsApp Cloud API receives the message 
          ↓ 
Abiz receives the webhook event 
          ↓ 
Message appears in Abiz Inbox 
          ↓ 
Business owner can reply from Abiz 
 
Abiz should NOT create a separate WhatsApp number for the business. 
The business's existing WhatsApp Business API number should remain connected to Meta Ads. 
 
 
 
3. Abiz Inbox 
When a customer sends a WhatsApp message, Abiz should receive it through the WhatsApp 
Cloud API webhook. 
Example: 
Customer: 
Hi 
↓ 
WhatsApp Cloud API 
↓ 
Abiz Webhook 
↓ 
Abiz Inbox 
Customer: +91 XXXXX XXXXX 
Message: Hi 
The business owner should be able to see: 
● Customer name 
● Customer phone number 
● Incoming messages 
● Message timestamp 
● Conversation history 
● Message status 
● Read/unread status 
The owner should be able to reply directly from the Abiz dashboard. 
4. Automated Messages 
Abiz is NOT an AI chatbot. 
The system only needs simple automated messaging. 
Examples: 
Welcome Message 
When a customer sends their first message: 
Hi! � 
Thank you for contacting ABC Business. 
How can we help you today? 
The business owner should be able to edit this message from the Abiz dashboard. 
Custom Automated Messages 
The system should support automated messages triggered by the business's 
website/app/backend. 
Example: 
Website/App 
↓ 
Abiz API 
↓ 
WhatsApp Cloud API 
↓ 
Customer WhatsApp 
No AI chatbot is required. 
5. Meta Ads → WhatsApp → Abiz 
This is a critical part of the system. 
A business can create a Meta advertisement with a WhatsApp action button. 
Example: 
META AD 
"Book Your Appointment Today" 
 
[Send WhatsApp Message] 
          ↓ 
      WhatsApp 
          ↓ 
Customer sends: 
"Hi" 
          ↓ 
WhatsApp Cloud API 
          ↓ 
       Abiz 
          ↓ 
     Abiz Inbox 
 
Abiz should not interfere with the Meta Ads campaign. 
Meta Ads continues to handle advertising. 
WhatsApp Cloud API handles WhatsApp communication. 
Abiz handles the dashboard, inbox, automation, and business management layer. 
 
 
6. Payment System for Abiz 
Abiz itself should have a subscription/payment system. 
A business owner should NOT be able to use the Abiz platform indefinitely without an active 
subscription. 
Example plans: 
Abiz Basic 
₹XXX/month 
 
Abiz Pro 
₹XXX/month 
 
Abiz Business 
₹XXX/month 
 
The exact pricing can be configured later. 
 
7. Subscription Flow 
The recommended flow: 
Business Owner 
      ↓ 
Create Abiz Account 
      ↓ 
Choose Plan 
      ↓ 
Payment Gateway 
      ↓ 
Payment Successful 
      ↓ 
Abiz Account Activated 
      ↓ 
Connect Meta / WABA 
      ↓ 
Connect WhatsApp Number 
      ↓ 
Number Verified 
      ↓ 
Abiz Dashboard 
 
If payment fails: 
Payment Failed 
      ↓ 
Account remains inactive/restricted 
      ↓ 
User can retry payment 
 
If an existing subscription expires: 
Subscription Expires 
       ↓ 
Abiz marks account as past_due/expired 
       ↓ 
Restrict Abiz services according to billing policy 
       ↓ 
User renews subscription 
       ↓ 
Services restored 
 
 
8. Payment Gateway Requirements 
Build the payment system so that the gateway can handle: 
● New subscription 
● Monthly subscription 
● Yearly subscription 
● Payment success 
● Payment failure 
● Subscription renewal 
● Subscription cancellation 
● Refund status 
● Webhook verification 
● Invoice/receipt generation 
● Payment history 
For India, the payment gateway should support INR and recurring/subscription payments. 
The payment gateway should communicate with Abiz through webhooks. 
Example: 
Payment Gateway 
↓ 
Payment Webhook 
↓ 
Abiz Backend 
↓ 
Update subscription status 
↓ 
Activate / renew / suspend account 
9. Account Status 
The backend should maintain a subscription status for every business. 
For example: 
TRIAL 
ACTIVE 
PAYMENT_PENDING 
PAST_DUE 
EXPIRED 
CANCELLED 
SUSPENDED 
The dashboard should show the current subscription status. 
Example: 
Subscription 
Plan: Abiz Pro 
Status: Active 
Renewal: 15 September 2026 
10. Important Separation of 
Responsibilities 
The developer should keep these systems separate: 
Meta 
Responsible for: 
● Meta Business Portfolio 
● Facebook/Instagram Ads 
● Ad campaigns 
● WhatsApp advertising CTA 
WhatsApp / Meta Cloud API 
Responsible for: 
● WhatsApp Business Account 
● Phone number 
● Sending messages 
● Receiving messages 
● WhatsApp templates 
● Message delivery 
● Webhooks 
Abiz 
Responsible for: 
● Business owner account 
● Dashboard 
● WhatsApp inbox 
● Conversation history 
● Automated messages 
● Business settings 
● Subscription management 
● Payment status 
● Usage/account management 
● API for website/app triggers 
Payment Gateway 
Responsible for: 
● Collecting subscription payments 
● Payment status 
● Recurring payments 
● Payment webhooks 
● Refund/payment records 
 
 
 
 
11. Overall Abiz Architecture 
The complete system should approximately work like this: 
                   ┌─────────────────┐ 
                    │���Meta�Ads������│ 
                    └────────┬────────┘ 
                             │ 
                       WhatsApp CTA 
                             │ 
                             ▼ 
                    ┌─────────────────┐ 
                    │����WhatsApp�����│ 
                    │�����User��������│ 
                    └────────┬────────┘ 
                             │ 
                         "Hi" 
                             │ 
                             ▼ 
                 ┌──────────────────────┐ 
                 │�WhatsApp�Cloud�API���│ 
                 └──────────┬───────────┘ 
                            │ 
                       Webhooks/API 
                            │ 
                            ▼ 
                 ┌──────────────────────┐ 
                 │��������Abiz����������│ 
                 │������Backend���������│ 
                 └──────────┬───────────┘ 
                            │ 
             ┌──────────────┼──────────────┐ 
             ▼��������������▼��������������▼ 
        Abiz Inbox     Automation      Database 
             │ 
             ▼ 
       Business Owner 
 
And separately: 
Business Owner 
      │ 
      ▼ 
 Abiz Dashboard 
      │ 
      ▼ 
 Choose Plan 
      │ 
      ▼ 
 Payment Gateway 
      │ 
      ▼ 
 Payment Webhook 
      │ 
      ▼ 
 Abiz Backend 
      │ 
      ▼ 
 Subscription Activated 
 
 
12. Multi-Tenant Architecture 
Abiz must be designed as a multi-tenant SaaS. 
Each business should have its own: 
● Abiz account 
● Business profile 
● Meta Business information 
● WABA 
● WhatsApp phone number 
● Conversations 
● Customers 
● Automated messages 
● Subscription 
● Payment records 
● API credentials/configuration 
One business must NEVER be able to access another business's data. 
Example: 
Business A 
├──�WhatsApp�Number�A 
├──�Customers�A 
├──�Conversations�A 
├──�Automations�A 
└──�Subscription A 
Business B 
├──�WhatsApp�Number�B 
├──�Customers�B 
├──�Conversations�B 
├──�Automations�B 
└──�Subscription�B 
13. Scaling Requirement 
The architecture should be designed so Abiz can eventually support approximately 1,000 
WhatsApp Business numbers/business accounts. 
Do not build it as a single-business system. 
The backend, database, webhook handling, authentication, queues and WhatsApp API 
integration should all be designed for multi-tenant operation from the beginning. 
14. Core MVP 
For the first version, build only: 
Business 
● Registration/login 
● Business profile 
● Subscription/payment 
● Meta/WABA connection 
● WhatsApp number connection 
● WhatsApp connection status 
Inbox 
● Receive WhatsApp messages 
● Send replies 
● Conversation list 
● Conversation history 
● Customer details 
● Read/unread status 
Automation 
● Welcome message 
● Appointment reminder 
● Payment reminder 
● Custom automated messages/API trigger 
● Enable/disable automation 
● Message editor 
Billing 
● Subscription plans 
● Payment gateway 
● Payment webhook 
● Subscription status 
● Payment history 
● Renewal/expiry handling 
Admin 
● View businesses 
● View subscription status 
● View connected WhatsApp numbers 
● Suspend/activate accounts 
● View payment status 
15. Do NOT Build in Version 1 
Do not add unnecessary features initially: 
● AI chatbot 
● AI replies 
● Voice bot 
● Complex CRM 
● WhatsApp calling 
● Marketing automation platform 
● Complex workflow builder 
● Advanced analytics 
● Social media management 
● Email marketing 
The core product is: 
WhatsApp Cloud API + Inbox + Simple Automation + SaaS Subscription. 