# SalesPulse Data Dictionary

This document maps out the Salesforce objects and specific standard/custom fields utilized by the SalesPulse platform, categorized by business line. It is generated based on active SOQL queries executed in the backend, as well as the internal SQLite models.

## 1. Opportunities (Sales & Travel/Insurance)
The `Opportunity` object tracks active sales, pipelines, and revenue. It is heavily utilized for both the **Travel** and **Insurance** business lines, differentiated by their `RecordTypeId`.

**Standard Fields:**
- `Id`: Unique identifier for the opportunity.
- `Name`: Opportunity name.
- `Amount`: Total revenue or booking value of the opportunity.
- `StageName`: Current stage in the sales pipeline (e.g., Prospecting, Closed Won, Closed Lost).
- `Probability`: Percentage likelihood of closing the deal.
- `ForecastCategory`: Pipeline categorization (e.g., Pipeline, Best Case, Commit, Closed).
- `CloseDate`: The expected or actual close date of the opportunity.
- `CreatedDate` / `CreatedById`: Audit fields for tracking origination.
- `OwnerId`: The Sales Advisor assigned to the opportunity.

**Custom Fields:**
- `Earned_Commission_Amount__c`: The specific commission earned by the advisor upon closing the deal.
- `Destination_Region__c`: (Travel) The target geographical region of the travel package (e.g., Europe, Caribbean).
- `Number_Traveling__c`: (Travel) The size of the travel party.

## 2. Accounts (Customers & Memberships)
The `Account` object acts as the central customer hub, holding contact information, membership details, and cross-sell indicators.

**Standard Fields:**
- `Id`: Unique customer identifier.
- `Name`: Full name of the customer (often PersonAccounts).
- `Phone`: Primary phone contact.
- `PersonEmail`: Primary email contact.
- `BillingCity` / `BillingPostalCode`: Locational data used heavily in Territory Mapping and Census matching.

**Custom Fields (Membership & Cross-Sell):**
- `LTV__c`: Lifetime Value categorization/scoring (e.g., A, B, C, D, E).
- `Member_Status__c`: Current AAA membership status (e.g., Active, Expired).
- `ImportantActiveMemExpiryDate__c`: Expiration date of the current membership.
- `ImportantActiveMemCoverage__c`: The level of membership coverage (e.g., Basic, Plus, Premier).
- `Insuance_Customer_ID__c`: A unique external identifier. If populated, it indicates the account holds an active Insurance policy.

## 3. Leads (Prospects)
The `Lead` object is used for raw, unqualified prospects entering the funnel before they are converted into Accounts/Opportunities.

**Standard Fields:**
- `Id` / `Name`: Prospect identifier and name.
- `Status`: Current state of the lead (e.g., Open, Contacted, Converted).
- `LeadSource`: Origin channel of the lead (e.g., Web, Referral).
- `ConvertedOpportunityId`: Used to trace revenue back to the original lead source.

## 4. Activities (Tasks & Logs)
The `Task` and `Event` objects map to advisor activity metrics.

**Standard Fields:**
- `Subject`: Title of the call, meeting, or email.
- `Status`: Completion status.
- `ActivityDate`: The date the activity took place.
- `Priority`: Urgency of the task.
- `Description`: Notes or context provided by the advisor.

## 5. Users (Advisors & Agents)
The `User` object represents the internal staff using SalesPulse.

**Standard Fields:**
- `Id`: Advisor identifier.
- `Name`: Full name of the advisor.
- `Email`: Contact email.
- `IsActive`: Boolean indicating if the advisor is currently active.

## 6. Internal SQLite Data Models (Analytics & Territory)
In addition to querying Salesforce, the SalesPulse backend utilizes a localized SQLite database to cache demographic data, audit logs, and performance targets to minimize SF API overhead.

**Geographic Data (Census & Map Mapping):**
- `GeoCounty`: Boundary and demographic data mapped to counties (FIPS, Population, Income, Home Value).
- `GeoZip`: Postal code level demographics and latitude/longitude mapping. 

**Advisor Target Management**:
- `MonthlyAdvisorTarget`: Tracks explicit goal setting for agents. Contains `target_amount` (Commission goal) and `target_bookings` metric.

**System & Security Auditing**:
- `AIAuditLog`: Tracks metadata on AI prompts sent to the LLM (tracks `query`, block status, and `intent`).
- `ActivityLog` / `ApiRequestMetric`: Logs general advisor engagement across various views in the UI.
