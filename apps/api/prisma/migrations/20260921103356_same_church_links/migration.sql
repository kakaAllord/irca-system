-- A role, and the people who hold it, must belong to the same church.
--
-- Found by a test: a role of another church, linked to a membership here,
-- granted its permissions. The permission query now pins every join to one
-- church, and these keys make the bad link impossible to store in the first
-- place, whatever writes it.

create unique index roles_church_id_id_key on roles (church_id, id);
create unique index church_memberships_church_id_id_key on church_memberships (church_id, id);

alter table role_permissions
  drop constraint "role_permissions_role_id_fkey",
  add constraint role_permissions_church_id_role_id_fkey
    foreign key (church_id, role_id) references roles (church_id, id) on delete cascade;

alter table membership_roles
  drop constraint "membership_roles_role_id_fkey",
  add constraint membership_roles_church_id_role_id_fkey
    foreign key (church_id, role_id) references roles (church_id, id) on delete cascade,
  drop constraint "membership_roles_membership_id_fkey",
  add constraint membership_roles_church_id_membership_id_fkey
    foreign key (church_id, membership_id) references church_memberships (church_id, id) on delete cascade;
