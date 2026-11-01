create table homes(
    id text primary key,
    name text not null,
    created_at text not null
);
create table members(
    id text primary key ,
    home_id text not null,
    name text not null,
    created_at text not null,
    constraint fk_members_home foreign key(home_id) references homes(id) on delete cascade
    -- on delete cascade inoder to follow the object oriented programming concept called composition relation
);
create table bills(
    id text primary key,
    home_id text not null,
    title text not null,
    total_cents integer not null,
    created_at text not null,
    constraint fk_bills_home foreign key(home_id) references homes(id) on delete cascade,
    constraint chk_total_bill_pos check(total_cents > 0)
);
create table shares(
    id text primary key,
    bill_id text not null,
    member_id text not null,
    amount_cents integer not null,
    paid_at text,
    idempotency_key text,
    constraint fk_shares_bill foreign key(bill_id) references bills(id) on delete cascade,
    constraint fk_shares_member foreign key(member_id) references members(id) on delete cascade,
    constraint chk_shared_amount_pos check(amount_cents > 0),
    constraint uq_share_idempotency unique(idempotency_key)
);

