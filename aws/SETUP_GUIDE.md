# AWS Console Setup Guide

Step-by-step instructions to set up DynamoDB, Lambda, and API Gateway.

---

## Step 1: Create DynamoDB Table

1. Go to **AWS Console** → **DynamoDB**
2. Click **Create table**
3. Settings:
   - Table name: `prophecy-tablet-puzzles`
   - Partition key: `id` (String)
   - Leave sort key empty
   - Table settings: **Default settings** (On-demand capacity for free tier)
4. Click **Create table**

---

## Step 2: Create Lambda Functions

For **each** of the 6 functions (`createPuzzle`, `getPuzzles`, `getPuzzle`, `votePuzzle`, `playPuzzle`, `completePuzzle`):

1. Go to **AWS Console** → **Lambda**
2. Click **Create function**
3. Settings:
   - Function name: e.g., `prophecy-createPuzzle`
   - Runtime: **Node.js 20.x**
   - Architecture: **x86_64**
   - Execution role: **Create new role with basic Lambda permissions**
4. Click **Create function**
5. In the code editor, **paste the code** from `aws/createPuzzle.js`
6. Click **Deploy**
7. Go to **Configuration** → **Permissions** → Click the execution role
8. Add permission: **AmazonDynamoDBFullAccess** (or create a minimal policy)

Repeat for all 6 functions.
38. **Note:** `createPuzzle.js` now generates a 5-character alphanumeric ID (e.g., `ABC12`) instead of a long UUID.

---

## Step 3: Create API Gateway

1. Go to **AWS Console** → **API Gateway**
2. Click **Create API** → **REST API** → **Build**
3. Settings:
   - API name: `prophecy-tablet-api`
   - Endpoint type: **Regional**
4. Click **Create API**

### Create Resources & Methods:

**Resource: `/puzzles`**
- Click **Create Resource** → Name: `puzzles`
- Select `/puzzles` → **Create Method** → **GET** → Lambda: `prophecy-getPuzzles`
- Select `/puzzles` → **Create Method** → **POST** → Lambda: `prophecy-createPuzzle`

**Resource: `/puzzles/{id}`**
- Select `/puzzles` → **Create Resource** → Name: `{id}` (with curly braces)
- Select `/{id}` → **Create Method** → **GET** → Lambda: `prophecy-getPuzzle`

**Resource: `/puzzles/{id}/vote`**
- Select `/{id}` → **Create Resource** → Name: `vote`
- Select `/vote` → **Create Method** → **POST** → Lambda: `prophecy-votePuzzle`

**Resource: `/puzzles/{id}/play`**
- Select `/{id}` → **Create Resource** → Name: `play`
- Select `/play` → **Create Method** → **POST** → Lambda: `prophecy-playPuzzle`

**Resource: `/puzzles/{id}/complete`**
- Select `/{id}` → **Create Resource** → Name: `complete`
- Select `/complete` → **Create Method** → **POST** → Lambda: `prophecy-completePuzzle`

---

## Step 4: Enable CORS

For **each** method (GET /puzzles, POST /puzzles, POST vote, POST play):

1. Select the method
2. Click **Enable CORS**
3. Check all boxes
4. Click **Save**

---

## Step 5: Deploy API

1. Click **Deploy API**
2. Stage name: `prod`
3. Click **Deploy**
4. Copy the **Invoke URL** (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/prod`)

---

## Step 6: Update Frontend

Add this URL to your frontend code:
```javascript
const API_URL = 'https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod';
```
