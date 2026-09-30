# Restore test

Date: 2026/09/30

The encrypted application backup was restored into a separate empty MongoDB test database on the Atlas Free cluster. All records used fake fixture data. The source and target databases were removed after verification.

<table>
<tr><th>Collection</th><th>Backup count</th><th>Restored count</th><th>Result</th></tr>
<tr><td>cards</td><td>1</td><td>1</td><td>Pass</td></tr>
<tr><td>users</td><td>1</td><td>1</td><td>Pass</td></tr>
<tr><td>lists</td><td>1</td><td>1</td><td>Pass</td></tr>
<tr><td>settings</td><td>1</td><td>1</td><td>Pass</td></tr>
</table>

The encrypted file contained no readable fake card text, contact fields, user email or password hash. Card images, sessions, login attempts and rate limits were absent from the restored database. A second restore into the populated target was refused as required.

Automated test: `restore into a separate empty database matches collection counts`

Command: `npm run test:step5`

Result: Pass, 4 tests
