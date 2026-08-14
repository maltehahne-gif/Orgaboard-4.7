from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.core.rbac import scoped_employee_id
from app.core.timeutils import week_bounds
from app.models import Customer, Employee, Product, ProductPrice, Role, Sale, SaleItem, User
from app.services.serializers import current_price
from app.services.stats import revenue_between, units_between

@pytest.fixture
def db():
    engine=create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False})
    Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine,expire_on_commit=False)
    session=Session()
    try: yield session
    finally: session.close()


def make_employee(db,name='Test User',role=Role.EMPLOYEE):
    u=User(email=f'{name.replace(" ",".").lower()}@test.local',full_name=name,password_hash='hash',role=role,must_change_password=False)
    db.add(u);db.flush();e=Employee(user_id=u.id,display_name=name,monthly_units_target=30);db.add(e);db.flush();return u,e


def test_revenue_and_units_derive_from_sale_items(db):
    u,e=make_employee(db)
    c=Customer(employee_id=e.id,first_name='Max',last_name='Muster');db.add(c)
    p=Product(name='Verifiziertes Testprodukt',verified=True);db.add(p);db.flush()
    s=Sale(customer_id=c.id,employee_id=e.id,sold_at=datetime.now(timezone.utc));db.add(s);db.flush()
    db.add_all([SaleItem(sale_id=s.id,product_id=p.id,product_name_snapshot=p.name,quantity=2,unit_price_cents=10000),SaleItem(sale_id=s.id,product_id=p.id,product_name_snapshot=p.name,quantity=1,unit_price_cents=5000)])
    db.commit();start,end=week_bounds()
    assert revenue_between(db,start,end,e.id)==25000
    assert units_between(db,start,end,e.id)==3


def test_employee_cannot_switch_scope(db):
    u,e=make_employee(db,'Employee One')
    _,other=make_employee(db,'Employee Two')
    assert scoped_employee_id(db,u,None)==e.id
    with pytest.raises(HTTPException) as exc:
        scoped_employee_id(db,u,other.id)
    assert exc.value.status_code==403


def test_team_leader_can_select_scope(db):
    tl,_=make_employee(db,'Team Lead',Role.TEAM_LEADER)
    _,other=make_employee(db,'Employee X')
    assert scoped_employee_id(db,tl,other.id)==other.id
    assert scoped_employee_id(db,tl,None) is None


def test_unverified_price_is_not_exposed(db):
    p=Product(name='Produkt X',verified=True);db.add(p);db.flush()
    db.add(ProductPrice(product_id=p.id,amount_cents=12345,source_url='https://example.test/source',verified=False));db.commit()
    assert current_price(db,p.id) is None
