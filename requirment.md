Abiz - Software Requirements Specification (SRS) v1.0
________________________________________
Product Name
Abiz
________________________________________
Project Objective
Build a SaaS web application that enables businesses to connect their WhatsApp Business Account using the Meta Cloud API, manage customer conversations through a simple chat interface, and send a customizable automatic welcome message.
The goal is to provide a lightweight WhatsApp inbox without unnecessary features.
________________________________________
Target Users
●	Small Businesses
●	Shops
●	Agencies
●	Clinics
●	Restaurants
●	Salons
●	Service Providers
________________________________________
Core Features
1. Authentication
●	User Registration
●	Login
●	Logout
●	Forgot Password
●	Change Password
________________________________________
2. Dashboard
Display:
●	Connected WhatsApp Number
●	Connection Status
●	Total Contacts
●	Total Conversations
●	Total Messages Sent
●	Total Messages Received
________________________________________
3. WhatsApp Integration
Integrate with Meta Cloud API.
Features:
●	Connect WhatsApp Business Account
●	Store Access Token Securely
●	Store Phone Number ID
●	Verify Webhook
●	Receive Incoming Messages
●	Send Outgoing Messages
●	Display Connection Status
________________________________________
4. Contacts
Features:
●	Add Contact
●	Edit Contact
●	Delete Contact
●	Search Contact
Fields:
●	Name
●	Phone Number
●	Notes (Optional)
________________________________________
5. Chat Interface
A clean interface similar to WhatsApp Web.
Features:
●	Conversation List
●	Search Conversations
●	Real-time Chat
●	Send Text Messages
●	Receive Messages
●	Message Timestamp
●	Sent / Delivered / Read Status (if available from Meta)
●	Scrollable Chat History
●	Automatic Refresh using WebSockets
________________________________________
6. Automatic Welcome Message
This is the only automation included in the MVP.
Features
●	Enable / Disable Welcome Message
●	User can edit the welcome message
●	Automatically send the welcome message when a customer starts a new conversation (or the first incoming message, depending on the chosen trigger)
●	Plain text only
Example
Hi 👋

Thank you for contacting ABC Company. Contact +911234567890, if you need more details

We have received your message and will reply as soon as possible.
________________________________________
Not Included
●	AI Chatbot
●	Keyword Replies
●	Auto Replies (other than welcome message)
●	Workflow Automation
●	Scheduled Messages
●	Appointment Reminders
●	Payment Reminders
●	Broadcast Messages
●	Campaign Messages
●	CRM
●	Analytics
●	Multiple Agents
●	Team Members
●	AI Integration
●	Voice Calling
●	Video Calling
________________________________________
7. Settings
User should be able to manage:
●	Company Name
●	WhatsApp Number
●	Access Token
●	Phone Number ID
●	Webhook Verify Token
●	Welcome Message
●	Profile Information
________________________________________
8. User Profile
●	Name
●	Email
●	Company Name
●	Password
________________________________________
Admin Panel
Admin should be able to:
●	View Users
●	Delete Users
●	Suspend Users
●	View Connected WhatsApp Numbers
●	View Webhook Errors
●	View System Logs
________________________________________
Technical Stack
Frontend
●	React
●	Next.js
●	Tailwind CSS
________________________________________
Backend
●	Node.js
●	Express.js
________________________________________
Database
PostgreSQL
or superbase for auth
________________________________________

________________________________________
Real-Time Communication
Socket.IO

________________________________________
Database Tables
Users

Companies

WhatsAppAccounts

Contacts

Conversations

Messages

WelcomeMessages

WebhookLogs



