Project
Claude Data Analyst UI for CSV upload → HTML report generation

Build a web application that lets users upload any relevant CSV file and receive an automatically generated interactive HTML report created by Claude Managed Agents.

2. User Stories
   As a user, I want to upload a CSV file from my browser so I can get analysis without coding.
   As a user, I want the report to appear quickly and visually, so I can understand the key findings immediately.
   As an admin, I want the backend to handle sensitive API keys securely and not expose them in the browser.
   As a developer, I want the deployment to run on Vercel or a serverless backend with minimal maintenance.

3. Scope
   In scope
   Frontend upload form for CSV files
   Backend endpoint to receive file uploads
   Claude Managed Agents integration:
   environment creation/reuse
   agent creation/reuse
   file upload
   session creation
   event streaming until completion
   report output retrieval
   Returning report.html to the frontend
   Displaying the report in-browser via iframe or embed
   Basic status/progress feedback
   Out of scope
   Custom user authentication
   CSV validation beyond basic format check
   Large-scale multi-user queuing
   Advanced report editing or customization UI

Success Criteria
User can upload a CSV and receive a generated report HTML page
The report is generated automatically using Claude Managed Agents
API key is kept server-side only
Frontend displays at least:
upload progress
task status
report preview or download link
Deployed app works on Vercel with a serverless backend or equivalent 5. Functional Requirements
Frontend
Upload CSV button
file selection and validation (.csv only)
status messages:
Uploading...
Analyzing...
Report ready
Error
display final report in an embedded viewer or provide a link to open/download
responsive layout, simple UI
Backend

REST endpoint: POST /api/analyze
accepts multipart file upload
validates CSV file type and size
uploads CSV to Anthropic Files API
creates or reuses environment + agent
creates a session with mounted file
sends analysis prompt
waits for session idle
downloads report.html
returns either:
a URL to the saved report
or the HTML content directly
Claude Managed Agents
reuse environment + agent where possible
environment should include pandas, plotly
prompt should be generic and adapt to arbitrary CSVs
output file path must be /mnt/session/outputs/report.html
report should be self-contained with embedded charts 6. Non-functional Requirements
Secure storage of ANTHROPIC_API_KEY
No client-side exposure of Claude secret keys
Use HTTPS for API requests
Fallback handling for failures and timeouts
Minimal dependencies
Deployable on Vercel with serverless functions

7. Architecture
   Recommended setup
   Frontend: Vercel static site
   Backend: Vercel Serverless Function or a small FastAPI/Flask app
   Storage: ephemeral per-request, no persistent file storage required
   Report delivery:
   direct HTML response
   or store report temporarily and return a URL
   Data flow
   User uploads CSV
   Frontend POSTs file to backend
   Backend uploads file to Anthropic
   Backend starts Managed Agent session
   Backend waits until session idle
   Backend downloads report.html
   Backend returns report to frontend
   Frontend displays report
8. API Contract
   POST /api/analyze

Request:
multipart form-data
file: CSV
Response:
200 OK:
reportUrl or reportHtml
status: success
400 invalid file
500 analysis failure

9. UI Wireframe
   Header: “Upload your CSV”
   Upload card with file picker
   Progress / status text
   Result area:
   embedded report.html
   or download button
10. Risks & Mitigation
    ANTHROPIC_API_KEY exposure
    Keep all Anthropic calls on server
    Long running analysis
    show spinner and timeout after a safe interval
    CSV format mismatch
    validate file and return friendly error
    Vercel serverless timeout
    if needed, use a backend with longer execution time or async polling
11. Launch Plan
    Build backend API and frontend upload page
    Test with sample CSVs
    Deploy to Vercel
    Validate report generation end-to-end
    Share and iterate
