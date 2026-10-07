import test from 'node:test';
import assert from 'node:assert/strict';
import {fillEmptyCardFields} from '../src/lib/cardSides.ts';
test('back fills only missing fields without replacing front or mutating either side',()=>{
  const front={fullName:'Confirmed Person',companyName:'Front Company',email:'front@example.test',phone:'',jobTitle:'  ',notes:'Confirmed notes'};
  const back={fullName:'Other Person',companyName:'Back Company',email:'back@example.test',phone:'+1 650 555 0123',jobTitle:'Director',notes:'Other notes'};
  const snapshot=structuredClone({front,back});
  assert.deepEqual(fillEmptyCardFields(front,back),{...front,phone:back.phone,jobTitle:back.jobTitle});
  assert.deepEqual({front,back},snapshot);
});
test('blank back fields and non-contact fields never replace front data',()=>{
  const front={fullName:'',email:'',notes:'',meetingContext:{metAtLocation:'Selected Expo'}};
  assert.deepEqual(fillEmptyCardFields(front,{fullName:'  ',email:'',meetingContext:{metAtLocation:'Wrong Expo'}}),front);
});
test('missing front contact fields accept trimmed back values',()=>{
  assert.deepEqual(fillEmptyCardFields({},{email:'  back@example.test  ',notes:'Back note'}),{email:'back@example.test',notes:'Back note'});
});
