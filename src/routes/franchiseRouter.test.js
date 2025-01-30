const request = require('supertest');
const app = require('../service'); 
const { Role, DB } = require('../database/database');

let adminUser; 
let adminToken; 

beforeAll(async () => {
    // Create an admin user for testing
    adminUser = await createAdminUser();

    const loginRes = await request(app).put('/api/auth').send({
        email: adminUser.email,
        password: 'toomanysecrets',
    });
    adminToken = loginRes.body.token;
    adminUser.id = loginRes.body.user.id; // capturing the ID
    expectValidJwt(adminToken);
});

describe('Franchise Router Tests', () => {
    test('Create franchise as an admin', async () => {
        const franchiseData = {
            name: randomName() + 'Franchise',
            admins: [{ email: adminUser.email }], 
        };
        
        const res = await request(app)
            .post('/api/franchise')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(franchiseData);
        
        expect(res.status).toBe(200);
        expect(res.body.name).toBe(franchiseData.name);
        expect(res.body.admins).toEqual([
            { id: adminUser.id, name: adminUser.name, email: adminUser.email },
        ]);
    });

    test('Get all franchises', async () => {
        const res = await request(app)
            .get('/api/franchise')
            .set('Authorization', `Bearer ${adminToken}`);
    
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });

    test('Get franchises for specific user', async () => {
        const res = await request(app)
            .get(`/api/franchise/${adminUser.id}`)
            .set('Authorization', `Bearer ${adminToken}`);
    
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('Delete a franchise as an admin', async () => {
        const franchiseId = await createTestFranchise();
    
        const deleteRes = await request(app)
            .delete(`/api/franchise/${franchiseId}`)
            .set('Authorization', `Bearer ${adminToken}`);
    
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.message).toBe('franchise deleted');
    });

    test('Create store under a franchise', async () => {
        const franchiseId = await createTestFranchise();
        const storeId = await createTestStore(franchiseId);
        console.log(storeId);
    });

    test('Delete a store under a franchise', async () => {
        const franchiseId = await createTestFranchise();
    
        const storeId = await createTestStore(franchiseId);
    
        // delete the store
        const deleteRes = await request(app)
            .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.message).toBe('store deleted');
    });    

    // cover failing paths for better branch coverage
    test('Fail to create a franchise as non-admin', async () => {
        const nonAdminUser = await createNonAdminUser();
        const nonAdminToken = await loginTestUser(nonAdminUser);
      
        const franchiseData = { 
            name: randomName() + 'franchise', 
            admins: [{ email: nonAdminUser.email }] 
        };
      
        const res = await request(app)
          .post('/api/franchise')
          .set('Authorization', `Bearer ${nonAdminToken}`)
          .send(franchiseData);
      
        expect(res.status).toBe(403);
        expect(res.body.message).toBe('unable to create a franchise');
    });

    test('Fail to create a store as non-admin', async () => {
        const franchiseId = await createTestFranchise();
        
        const nonAdminUser = await createNonAdminUser();
        const nonAdminToken = await loginTestUser(nonAdminUser);
    
        const storeData = { name: 'Unauthorized Store' };
        const storeRes = await request(app)
            .post(`/api/franchise/${franchiseId}/store`)
            .set('Authorization', `Bearer ${nonAdminToken}`)
            .send(storeData);
    
        expect(storeRes.status).toBe(403);
        expect(storeRes.body.message).toBe('unable to create a store');
    });

    test('Fail to delete a store as non-admin', async () => {
        const franchiseId = await createTestFranchise();
        const storeId = await createTestStore(franchiseId);
    
        const nonAdminUser = await createNonAdminUser();
        const nonAdminToken = await loginTestUser(nonAdminUser);
    
        const deleteRes = await request(app)
            .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
            .set('Authorization', `Bearer ${nonAdminToken}`);
    
        expect(deleteRes.status).toBe(403);
        expect(deleteRes.body.message).toBe('unable to delete a store');
    });

    test('Fail to delete a franchise due to DB error', async () => {
        const franchiseId = await createTestFranchise();
    
        // Mock the query method to throw an error when trying to delete a franchise
        jest.spyOn(DB, 'query').mockImplementationOnce(async (conn, sql, params) => {
            if (sql.includes('DELETE FROM franchise')) {
                console.log(params);
                throw new Error('Simulated DB failure');
            }
            return [];
        });
    
        const deleteRes = await request(app)
            .delete(`/api/franchise/${franchiseId}`)
            .set('Authorization', `Bearer ${adminToken}`);
    
        expect(deleteRes.status).toBe(500);
    
        // Restore DB query function after test
        DB.query.mockRestore();
    });

    test('Return empty array if user has no franchises', async () => {
        const nonFranchiseUser = await createNonAdminUser();
        const nonFranchiseToken = await loginTestUser(nonFranchiseUser);
    
        const res = await request(app)
            .get(`/api/franchise/${nonFranchiseUser.id}`)
            .set('Authorization', `Bearer ${nonFranchiseToken}`);
    
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

//// helper functions for unit tests ////
function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

function randomName() {
    return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }]};
    user.name = randomName();
    user.email = user.name + '@admin.com';

    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}

async function createNonAdminUser() {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Diner }]};
    user.name = randomName();
    user.email = user.name + '@nonadmin.com';
    
    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}

async function loginTestUser(user) {
    const loginRes = await request(app).put('/api/auth').send({
        email: user.email,
        password: 'toomanysecrets',
    });

    const userToken = loginRes.body.token;
    expectValidJwt(userToken);

    return userToken;
}

async function createTestFranchise() {
    const franchiseData = {
        name: randomName() + 'Franchise',
        admins: [{ email: adminUser.email }],
    };
    const createRes = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(franchiseData);

    const franchiseId = createRes.body.id;
    expect(createRes.status).toBe(200);
    return franchiseId;
}

async function createTestStore(franchiseId) {
    const storeData = { 
        name: randomName() + 'Store' 
    };
    const storeRes = await request(app)
        .post(`/api/franchise/${franchiseId}/store`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(storeData);
    
    expect(storeRes.status).toBe(200);
    expect(storeRes.body.name).toBe(storeData.name);

    return storeRes.body.id;
}
  